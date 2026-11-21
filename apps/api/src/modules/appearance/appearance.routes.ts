import {
  APPEARANCE_COLOR_IDS,
  APPEARANCE_FONT_IDS,
  APPEARANCE_STYLE_IDS,
  DEFAULT_APPEARANCE,
  getBrand,
  parseTenantAppearance,
  resolveAppearanceTokens,
  type RealmId,
  type TenantAppearanceConfig,
} from '@daminatofit/brand';
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import type { Sql } from 'postgres';
import { z } from 'zod';
import type { Env } from '../../config/env';
import { withTenantContext } from '../../db/tenant-tx';
import { createS3Client, deleteObject, presignGet } from '../../lib/s3';
import type { AuthInstance } from '../auth/realms';
import { resolveAuthContext } from '../auth/session';

interface AppearanceRouteOpts extends FastifyPluginOptions {
  auths: Record<RealmId, AuthInstance>;
  appSql: Sql;
  migratorSql: Sql;
  env: Env;
}

const PatchSchema = z.object({
  styleId: z.enum(APPEARANCE_STYLE_IDS),
  colorId: z.enum(APPEARANCE_COLOR_IDS),
  fontId: z.enum(APPEARANCE_FONT_IDS),
  logoMediaId: z.string().uuid().nullable().optional(),
});

function brandAllowsTrainerAppearance(distribution: string | undefined): boolean {
  return distribution === 'platform';
}

async function loadTenantAppearance(
  sql: Sql,
  tenantId: string,
): Promise<{ config: TenantAppearanceConfig; logoMediaId: string | null }> {
  const rows = await sql<{ branding: unknown; logo_media_id: string | null }[]>`
    SELECT branding, logo_media_id FROM tenants WHERE id = ${tenantId}
  `;
  const row = rows[0];
  const config = parseTenantAppearance(row?.branding ?? {});
  if (row?.logo_media_id) config.logoMediaId = row.logo_media_id;
  return { config, logoMediaId: config.logoMediaId };
}

export async function appearanceRoutes(app: FastifyInstance, opts: AppearanceRouteOpts) {
  const s3 = createS3Client(opts.env);

  app.get('/v1/appearance/catalog', async () => {
    return {
      styles: APPEARANCE_STYLE_IDS,
      colors: APPEARANCE_COLOR_IDS,
      fonts: APPEARANCE_FONT_IDS,
      defaults: DEFAULT_APPEARANCE,
    };
  });

  app.get('/v1/me/appearance', async (request, reply) => {
    const auth = await resolveAuthContext(request, opts.auths, opts.appSql);
    if (!auth?.membership) return reply.code(401).send({ error: 'unauthorized' });

    const { config } = await withTenantContext(
      opts.appSql,
      {
        realm: auth.realm,
        userId: auth.domainUser.id,
        tenantId: auth.membership.tenantId,
        membershipId: auth.membership.id,
        role: auth.membership.role,
      },
      async (tx) => loadTenantAppearance(tx, auth.membership!.tenantId),
    );

    let logoUrl: string | null = null;
    if (config.logoMediaId) {
      const media = await withTenantContext(
        opts.appSql,
        {
          realm: auth.realm,
          userId: auth.domainUser.id,
          tenantId: auth.membership.tenantId,
          membershipId: auth.membership.id,
          role: auth.membership.role,
        },
        async (tx) =>
          tx<{ storage_key: string }[]>`
            SELECT storage_key FROM media_assets
            WHERE id = ${config.logoMediaId}
              AND status = 'ready'
              AND kind = 'image'
          `,
      );
      if (media[0]) {
        logoUrl = await presignGet(s3, opts.env, media[0].storage_key);
      }
    }

    const tokens = resolveAppearanceTokens(config, 'light');
    return {
      appearance: config,
      logoUrl,
      tokens: {
        styleId: tokens.styleId,
        colorId: tokens.colorId,
        fontId: tokens.fontId,
        colors: tokens.colors,
        layout: tokens.layout,
      },
      editable:
        auth.membership.role === 'owner' &&
        brandAllowsTrainerAppearance(getBrand(auth.brandId).distribution),
    };
  });

  app.put('/v1/me/appearance', async (request, reply) => {
    const auth = await resolveAuthContext(request, opts.auths, opts.appSql);
    if (!auth?.membership || auth.membership.role !== 'owner') {
      return reply.code(403).send({ error: 'forbidden' });
    }
    if (!brandAllowsTrainerAppearance(getBrand(auth.brandId).distribution)) {
      return reply.code(403).send({ error: 'appearance_not_allowed_for_brand' });
    }

    const parsed = PatchSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });

    const tenantId = auth.membership.tenantId;
    const logoMediaId = parsed.data.logoMediaId === undefined ? undefined : parsed.data.logoMediaId;

    if (logoMediaId) {
      const ok = await withTenantContext(
        opts.appSql,
        {
          realm: auth.realm,
          userId: auth.domainUser.id,
          tenantId,
          membershipId: auth.membership.id,
          role: 'owner',
        },
        async (tx) =>
          tx<{ id: string }[]>`
            SELECT id FROM media_assets
            WHERE id = ${logoMediaId}
              AND tenant_id = ${tenantId}
              AND kind = 'image'
              AND status = 'ready'
          `,
      );
      if (!ok[0]) return reply.code(400).send({ error: 'invalid_logo' });
    }

    const previous = await loadTenantAppearance(opts.migratorSql, tenantId);
    const updatedAt = new Date().toISOString();
    const branding: TenantAppearanceConfig = {
      styleId: parsed.data.styleId,
      colorId: parsed.data.colorId,
      fontId: parsed.data.fontId,
      logoMediaId: logoMediaId === undefined ? previous.config.logoMediaId : logoMediaId,
      updatedAt,
    };

    await opts.migratorSql`
      UPDATE tenants SET
        branding = ${JSON.stringify(branding)}::jsonb,
        logo_media_id = ${branding.logoMediaId},
        updated_at = now()
      WHERE id = ${tenantId}
    `;

    if (previous.logoMediaId && previous.logoMediaId !== branding.logoMediaId) {
      await orphanUnusedLogo(opts.migratorSql, s3, opts.env, previous.logoMediaId);
    }

    return { appearance: branding };
  });

  app.post('/v1/me/appearance/reset', async (request, reply) => {
    const auth = await resolveAuthContext(request, opts.auths, opts.appSql);
    if (!auth?.membership || auth.membership.role !== 'owner') {
      return reply.code(403).send({ error: 'forbidden' });
    }
    if (!brandAllowsTrainerAppearance(getBrand(auth.brandId).distribution)) {
      return reply.code(403).send({ error: 'appearance_not_allowed_for_brand' });
    }

    const tenantId = auth.membership.tenantId;
    const previous = await loadTenantAppearance(opts.migratorSql, tenantId);
    const branding: TenantAppearanceConfig = {
      ...DEFAULT_APPEARANCE,
      updatedAt: new Date().toISOString(),
    };
    await opts.migratorSql`
      UPDATE tenants SET
        branding = ${JSON.stringify(branding)}::jsonb,
        logo_media_id = NULL,
        updated_at = now()
      WHERE id = ${tenantId}
    `;
    if (previous.logoMediaId) {
      await orphanUnusedLogo(opts.migratorSql, s3, opts.env, previous.logoMediaId);
    }
    return { appearance: branding };
  });
}

async function orphanUnusedLogo(
  sql: Sql,
  s3: ReturnType<typeof createS3Client>,
  env: Env,
  mediaId: string,
): Promise<void> {
  const stillUsed = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM tenants
    WHERE logo_media_id = ${mediaId}
       OR branding->>'logoMediaId' = ${mediaId}
  `;
  if ((stillUsed[0]?.n ?? 0) > 0) return;

  const rows = await sql<{ storage_key: string; size_bytes: number | null; tenant_id: string }[]>`
    SELECT storage_key, size_bytes, tenant_id FROM media_assets
    WHERE id = ${mediaId} AND kind = 'image' AND status = 'ready'
  `;
  const asset = rows[0];
  if (!asset) return;

  await deleteObject(s3, env, asset.storage_key).catch(() => undefined);
  await sql`
    UPDATE media_assets SET status = 'orphaned', updated_at = now() WHERE id = ${mediaId}
  `;
  if (asset.size_bytes) {
    await sql`
      UPDATE tenant_usage
      SET storage_bytes = GREATEST(0, storage_bytes - ${asset.size_bytes}),
          updated_at = now()
      WHERE tenant_id = ${asset.tenant_id}
    `;
  }
}
