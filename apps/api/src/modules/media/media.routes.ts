import { randomUUID } from 'node:crypto';
import type { RealmId } from '@daminatofit/brand';
import type { FastifyInstance } from 'fastify';
import type { Sql } from 'postgres';
import { z } from 'zod';
import type { Env } from '../../config/env';
import { withTenantContext } from '../../db/tenant-tx';
import { probeVideoBuffer } from '../../lib/media-probe';
import {
  createS3Client,
  deleteObject,
  getObjectBytes,
  incomingKey,
  moveObject,
  presignGet,
  presignPut,
  readyKey,
} from '../../lib/s3';
import type { AuthInstance } from '../auth/realms';
import { resolveAuthContext } from '../auth/session';

const RequestUploadSchema = z.object({
  contentType: z.enum(['video/mp4', 'video/quicktime']),
  declaredSizeBytes: z.number().int().positive(),
});

export async function mediaRoutes(
  app: FastifyInstance,
  opts: {
    auths: Record<RealmId, AuthInstance>;
    appSql: Sql;
    migratorSql: Sql;
    env: Env;
  },
): Promise<void> {
  const s3 = createS3Client(opts.env);

  app.post('/v1/media/uploads', async (request, reply) => {
    const auth = await resolveAuthContext(request, opts.auths, opts.appSql);
    if (!auth?.membership || auth.membership.role !== 'owner') {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const parsed = RequestUploadSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });
    if (parsed.data.declaredSizeBytes > opts.env.MEDIA_MAX_BYTES) {
      return reply.code(400).send({ error: 'file_too_large', maxBytes: opts.env.MEDIA_MAX_BYTES });
    }

    const assetId = randomUUID();
    const key = incomingKey(auth.membership.tenantId, assetId);

    await withTenantContext(
      opts.appSql,
      {
        realm: auth.realm,
        userId: auth.domainUser.id,
        tenantId: auth.membership.tenantId,
        membershipId: auth.membership.id,
        role: 'owner',
      },
      async (tx) => {
        await tx`
          INSERT INTO media_assets (
            id, tenant_id, kind, storage_key, status, declared_size_bytes, uploaded_by
          ) VALUES (
            ${assetId},
            ${auth.membership!.tenantId},
            'video',
            ${key},
            'pending_upload',
            ${parsed.data.declaredSizeBytes},
            ${auth.domainUser.id}
          )
        `;
      },
    );

    const uploadUrl = await presignPut(s3, opts.env, key, parsed.data.contentType);
    return {
      assetId,
      uploadUrl,
      storageKey: key,
      expiresInSeconds: opts.env.MEDIA_UPLOAD_URL_TTL_SECONDS,
      maxBytes: opts.env.MEDIA_MAX_BYTES,
    };
  });

  app.post('/v1/media/:id/confirm', async (request, reply) => {
    const auth = await resolveAuthContext(request, opts.auths, opts.appSql);
    if (!auth?.membership || auth.membership.role !== 'owner') {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const assetId = (request.params as { id: string }).id;
    const tenantId = auth.membership.tenantId;

    const rows = await withTenantContext(
      opts.appSql,
      {
        realm: auth.realm,
        userId: auth.domainUser.id,
        tenantId,
        membershipId: auth.membership.id,
        role: 'owner',
      },
      async (tx) =>
        tx<{ id: string; storage_key: string; status: string }[]>`
          SELECT id, storage_key, status FROM media_assets
          WHERE id = ${assetId} AND tenant_id = ${tenantId}
        `,
    );
    const asset = rows[0];
    if (!asset) return reply.code(404).send({ error: 'not_found' });
    if (asset.status !== 'pending_upload' && asset.status !== 'rejected') {
      return reply.code(409).send({ error: 'invalid_status', status: asset.status });
    }

    await withTenantContext(
      opts.appSql,
      {
        realm: auth.realm,
        userId: auth.domainUser.id,
        tenantId,
        membershipId: auth.membership.id,
        role: 'owner',
      },
      async (tx) => {
        await tx`
          UPDATE media_assets SET status = 'validating', updated_at = now()
          WHERE id = ${assetId}
        `;
      },
    );

    const ownerCtx = {
      realm: auth.realm,
      domainUser: auth.domainUser,
      membership: auth.membership,
    };

    let buffer: Buffer;
    try {
      buffer = await getObjectBytes(s3, opts.env, asset.storage_key, opts.env.MEDIA_MAX_BYTES);
    } catch {
      await markRejected(opts.appSql, ownerCtx, assetId, 'object_missing_or_too_large');
      return reply.code(400).send({ error: 'upload_incomplete' });
    }

    const probe = await probeVideoBuffer(opts.env, buffer);

    if (!probe.ok) {
      await markRejected(opts.appSql, ownerCtx, assetId, probe.rejectionReason ?? 'rejected');
      await deleteObject(s3, opts.env, asset.storage_key).catch(() => undefined);
      return reply.code(400).send({ error: probe.rejectionReason ?? 'rejected' });
    }

    // Dedup: if same sha already ready for this tenant, reuse it and orphan the new upload.
    const existing = await opts.migratorSql<{ id: string; storage_key: string }[]>`
      SELECT id, storage_key FROM media_assets
      WHERE tenant_id = ${tenantId}
        AND status = 'ready'
        AND sha256 = ${probe.sha256}
      LIMIT 1
    `;
    if (existing[0]) {
      await deleteObject(s3, opts.env, asset.storage_key).catch(() => undefined);
      await opts.migratorSql`
        UPDATE media_assets
        SET status = 'orphaned', updated_at = now(), sha256 = ${probe.sha256}
        WHERE id = ${assetId}
      `;
      return {
        assetId: existing[0].id,
        status: 'ready',
        deduplicated: true,
        sha256: probe.sha256,
        sizeBytes: probe.sizeBytes,
        durationMs: probe.durationMs,
      };
    }

    // Quota check
    const usage = await opts.migratorSql<{ storage_bytes: number }[]>`
      SELECT storage_bytes FROM tenant_usage WHERE tenant_id = ${tenantId}
    `;
    const used = usage[0]?.storage_bytes ?? 0;
    const quota =
      (
        await opts.migratorSql<{ storage_quota_bytes: number | null }[]>`
          SELECT storage_quota_bytes FROM tenants WHERE id = ${tenantId}
        `
      )[0]?.storage_quota_bytes ?? opts.env.DEFAULT_STORAGE_QUOTA_BYTES;

    if (used + probe.sizeBytes > quota) {
      await markRejected(opts.appSql, ownerCtx, assetId, 'quota_exceeded');
      await deleteObject(s3, opts.env, asset.storage_key).catch(() => undefined);
      return reply.code(400).send({ error: 'quota_exceeded', quotaBytes: quota, usedBytes: used });
    }

    const dest = readyKey(tenantId, assetId);
    try {
      await moveObject(s3, opts.env, asset.storage_key, dest);
    } catch (error) {
      request.log.error(error);
      await markRejected(opts.appSql, ownerCtx, assetId, 'move_failed');
      return reply.code(500).send({ error: 'storage_error' });
    }

    await opts.migratorSql`
      UPDATE media_assets SET
        status = 'ready',
        storage_key = ${dest},
        size_bytes = ${probe.sizeBytes},
        sha256 = ${probe.sha256},
        container = ${probe.container},
        video_codec = ${probe.videoCodec},
        width = ${probe.width},
        height = ${probe.height},
        duration_ms = ${probe.durationMs},
        rejection_reason = NULL,
        updated_at = now()
      WHERE id = ${assetId}
    `;
    await opts.migratorSql`
      INSERT INTO tenant_usage (tenant_id, storage_bytes, updated_at)
      VALUES (${tenantId}, ${probe.sizeBytes}, now())
      ON CONFLICT (tenant_id) DO UPDATE
      SET storage_bytes = tenant_usage.storage_bytes + EXCLUDED.storage_bytes,
          updated_at = now()
    `;

    return {
      assetId,
      status: 'ready',
      deduplicated: false,
      sha256: probe.sha256,
      sizeBytes: probe.sizeBytes,
      durationMs: probe.durationMs,
    };
  });

  app.get('/v1/media/:id/playback-url', async (request, reply) => {
    const auth = await resolveAuthContext(request, opts.auths, opts.appSql);
    if (!auth?.membership) return reply.code(401).send({ error: 'unauthorized' });
    const assetId = (request.params as { id: string }).id;

    const rows = await withTenantContext(
      opts.appSql,
      {
        realm: auth.realm,
        userId: auth.domainUser.id,
        tenantId: auth.membership.tenantId,
        membershipId: auth.membership.id,
        role: auth.membership.role,
      },
      async (tx) =>
        tx<{ id: string; storage_key: string; status: string; tenant_id: string | null }[]>`
          SELECT id, storage_key, status, tenant_id FROM media_assets
          WHERE id = ${assetId} AND status = 'ready'
        `,
    );
    const asset = rows[0];
    if (!asset) return reply.code(404).send({ error: 'not_found' });

    const url = await presignGet(s3, opts.env, asset.storage_key);
    return {
      url,
      expiresInSeconds: opts.env.MEDIA_PLAYBACK_URL_TTL_SECONDS,
      autoplay: false,
    };
  });

  app.delete('/v1/media/:id', async (request, reply) => {
    const auth = await resolveAuthContext(request, opts.auths, opts.appSql);
    if (!auth?.membership || auth.membership.role !== 'owner') {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const assetId = (request.params as { id: string }).id;
    const tenantId = auth.membership.tenantId;

    const refs = await opts.migratorSql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM exercise_revisions
      WHERE video_media_id = ${assetId}
    `;
    if ((refs[0]?.n ?? 0) > 0) {
      return reply.code(409).send({ error: 'still_referenced' });
    }

    const asset = await withTenantContext(
      opts.appSql,
      {
        realm: auth.realm,
        userId: auth.domainUser.id,
        tenantId,
        membershipId: auth.membership.id,
        role: 'owner',
      },
      async (tx) =>
        tx<{ storage_key: string; size_bytes: number | null; status: string }[]>`
          SELECT storage_key, size_bytes, status FROM media_assets
          WHERE id = ${assetId} AND tenant_id = ${tenantId}
        `,
    );
    if (!asset[0]) return reply.code(404).send({ error: 'not_found' });

    await deleteObject(s3, opts.env, asset[0].storage_key).catch(() => undefined);
    await opts.migratorSql`
      UPDATE media_assets SET status = 'deleted', updated_at = now() WHERE id = ${assetId}
    `;
    if (asset[0].status === 'ready' && asset[0].size_bytes) {
      await opts.migratorSql`
        UPDATE tenant_usage
        SET storage_bytes = GREATEST(0, storage_bytes - ${asset[0].size_bytes}),
            updated_at = now()
        WHERE tenant_id = ${tenantId}
      `;
    }
    return { status: 'deleted' };
  });
}

async function markRejected(
  appSql: Sql,
  auth: {
    realm: string;
    domainUser: { id: string };
    membership: { tenantId: string; id: string };
  },
  assetId: string,
  reason: string,
) {
  await withTenantContext(
    appSql,
    {
      realm: auth.realm,
      userId: auth.domainUser.id,
      tenantId: auth.membership.tenantId,
      membershipId: auth.membership.id,
      role: 'owner',
    },
    async (tx) => {
      await tx`
        UPDATE media_assets
        SET status = 'rejected', rejection_reason = ${reason}, updated_at = now()
        WHERE id = ${assetId}
      `;
    },
  );
}
