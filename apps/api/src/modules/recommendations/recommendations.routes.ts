import type { RealmId } from '@daminatofit/brand';
import {
  benefitIsActive,
  normalizeDestination,
  RecommendationReorderSchema,
  RecommendationReportSchema,
  RecommendationWriteSchema,
} from '@daminatofit/contracts';
import type { FastifyInstance } from 'fastify';
import type { Sql } from 'postgres';
import { z } from 'zod';
import type { Env } from '../../config/env';
import { withTenantContext, type TenantContext } from '../../db/tenant-tx';
import { createS3Client, presignGet } from '../../lib/s3';
import type { AuthInstance } from '../auth/realms';
import { resolveAuthContext, toTenantContext, type AuthContext } from '../auth/session';

const IdSchema = z.string().uuid();

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function asDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

interface RecommendationRow {
  id: string;
  tenant_id: string;
  category_slug: string;
  category_name: string;
  name: string;
  description: string;
  image_media_id: string | null;
  destination_kind: string;
  destination_url: string;
  action_label: string | null;
  benefit_label: string | null;
  benefit_description: string | null;
  promo_code: string | null;
  benefit_terms: string | null;
  benefit_expires_on: Date | string | null;
  professional_license: string | null;
  commercial_declared: boolean;
  status: string;
  sort_order: number;
  moderation_hidden_at: Date | string | null;
  moderation_reason: string | null;
  trainer_name: string | null;
  storage_key: string | null;
}

async function present(row: RecommendationRow, env: Env, audience: 'trainer' | 'student') {
  const expiresOn = asDate(row.benefit_expires_on);
  const benefitActive = row.commercial_declared && benefitIsActive(expiresOn, todayUtc());
  let imageUrl: string | null = null;
  if (row.storage_key && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY) {
    try {
      imageUrl = await presignGet(createS3Client(env), env, row.storage_key);
    } catch {
      imageUrl = null;
    }
  }
  return {
    id: row.id,
    tenantId: row.tenant_id,
    categorySlug: row.category_slug,
    categoryName: row.category_name,
    name: row.name,
    description: row.description || null,
    imageMediaId: row.image_media_id,
    imageUrl,
    destinationKind: row.destination_kind,
    destinationUrl: row.destination_url,
    actionLabel: row.action_label,
    benefitLabel: benefitActive ? row.benefit_label : null,
    benefitDescription: benefitActive ? row.benefit_description : null,
    promoCode: benefitActive ? row.promo_code : null,
    benefitTerms: benefitActive ? row.benefit_terms : null,
    benefitExpiresOn: expiresOn,
    benefitActive,
    benefitExpired: Boolean(row.commercial_declared && expiresOn && !benefitActive),
    professionalLicense: row.professional_license,
    licenseVerifiedByPlatform: false,
    commercialDeclared: row.commercial_declared,
    status: row.status,
    sortOrder: row.sort_order,
    moderationHidden: Boolean(row.moderation_hidden_at),
    moderationReason: audience === 'trainer' ? row.moderation_reason : null,
    trainerName: row.trainer_name,
    certifiedByPlatform: false,
  };
}

const SELECT_LIST = `
  r.id, r.tenant_id, c.slug AS category_slug, c.name AS category_name,
  r.name, r.description, r.image_media_id, r.destination_kind, r.destination_url,
  r.action_label, r.benefit_label, r.benefit_description, r.promo_code, r.benefit_terms,
  r.benefit_expires_on, r.professional_license, r.commercial_declared, r.status,
  r.sort_order, r.moderation_hidden_at, r.moderation_reason,
  COALESCE(tp.display_name, t.name) AS trainer_name,
  m.storage_key
`;

export async function recommendationsRoutes(
  app: FastifyInstance,
  opts: {
    auths: Record<RealmId, AuthInstance>;
    appSql: Sql;
    env: Env;
  },
): Promise<void> {
  async function authed(request: Parameters<typeof resolveAuthContext>[0]) {
    return resolveAuthContext(request, opts.auths, opts.appSql);
  }

  function ctx(auth: AuthContext): TenantContext {
    return toTenantContext(auth);
  }

  function deny(
    auth: AuthContext | null,
    reply: { code: (status: number) => { send: (body: unknown) => unknown } },
    role?: 'owner' | 'student',
  ) {
    if (!auth) return reply.code(401).send({ error: 'unauthorized' });
    if (!auth.membership || (role && auth.membership.role !== role)) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    return null;
  }

  app.get('/v1/recommendation-categories', async (request, reply) => {
    const auth = await authed(request);
    if (!auth?.membership) return reply.code(401).send({ error: 'unauthorized' });
    const rows = await withTenantContext(
      opts.appSql,
      ctx(auth),
      (tx) =>
        tx<{ slug: string; name: string; sort_order: number }[]>`
        SELECT slug, name, sort_order
        FROM recommendation_categories
        WHERE active
        ORDER BY sort_order, name
      `,
    );
    return {
      items: rows.map((row) => ({ slug: row.slug, name: row.name, sortOrder: row.sort_order })),
      note: 'Categories describe a recommendation. They are not a certification.',
    };
  });

  app.get('/v1/recommendations', async (request, reply) => {
    const auth = await authed(request);
    const rejected = deny(auth, reply, 'owner');
    if (rejected || !auth) return rejected;
    const rows = await withTenantContext(opts.appSql, ctx(auth), (tx) =>
      tx.unsafe<RecommendationRow[]>(`
        SELECT ${SELECT_LIST}
        FROM trainer_recommendations r
        JOIN recommendation_categories c ON c.id = r.category_id
        JOIN tenants t ON t.id = r.tenant_id
        LEFT JOIN trainer_profiles tp ON tp.tenant_id = t.id
        LEFT JOIN media_assets m ON m.id = r.image_media_id AND m.status = 'ready'
        ORDER BY r.sort_order ASC, r.created_at ASC
      `),
    );
    const items = [];
    for (const row of rows) items.push(await present(row, opts.env, 'trainer'));
    return { items };
  });

  app.get('/v1/recommendations/published', async (request, reply) => {
    const auth = await authed(request);
    const rejected = deny(auth, reply, 'student');
    if (rejected || !auth) return rejected;
    const rows = await withTenantContext(opts.appSql, ctx(auth), (tx) =>
      tx.unsafe<RecommendationRow[]>(`
        SELECT ${SELECT_LIST}
        FROM trainer_recommendations r
        JOIN recommendation_categories c ON c.id = r.category_id
        JOIN tenants t ON t.id = r.tenant_id
        LEFT JOIN trainer_profiles tp ON tp.tenant_id = t.id
        LEFT JOIN media_assets m ON m.id = r.image_media_id AND m.status = 'ready'
        ORDER BY r.sort_order ASC, r.created_at ASC
      `),
    );
    const items = [];
    for (const row of rows) items.push(await present(row, opts.env, 'student'));
    return {
      items,
      notice:
        'Las recomendaciones las elige tu entrenador. DaminatoFit no las certifica, no verifica matrículas y no cobra comisión por estos acuerdos.',
    };
  });

  app.post(
    '/v1/recommendations',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const auth = await authed(request);
      const rejected = deny(auth, reply, 'owner');
      if (rejected || !auth?.membership) return rejected;
      const parsed = RecommendationWriteSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });
      const destination = normalizeDestination(
        parsed.data.destinationKind,
        parsed.data.destinationUrl,
      );
      if (!destination.ok) return reply.code(400).send({ error: destination.error });

      try {
        const created = await withTenantContext(opts.appSql, ctx(auth), async (tx) => {
          const category = await tx<{ id: string }[]>`
            SELECT id FROM recommendation_categories
            WHERE slug = ${parsed.data.categorySlug} AND active
          `;
          if (!category[0]) throw new Error('unknown_category');
          if (parsed.data.imageMediaId) {
            const media = await tx<{ id: string }[]>`
              SELECT id FROM media_assets
              WHERE id = ${parsed.data.imageMediaId}
                AND tenant_id = ${auth.membership!.tenantId}
                AND kind = 'image'
                AND status = 'ready'
            `;
            if (!media[0]) throw new Error('invalid_image');
          }
          const count = await tx<{ n: number }[]>`
            SELECT count(*)::int AS n FROM trainer_recommendations
            WHERE status <> 'archived'
          `;
          if ((count[0]?.n ?? 0) >= 100) throw new Error('too_many');
          const sort = await tx<{ next: number }[]>`
            SELECT COALESCE(max(sort_order), 0) + 1 AS next FROM trainer_recommendations
          `;
          const rows = await tx<{ id: string }[]>`
            INSERT INTO trainer_recommendations (
              tenant_id, author_user_id, category_id, name, description, image_media_id,
              destination_kind, destination_url, action_label, benefit_label, benefit_description,
              promo_code, benefit_terms, benefit_expires_on, professional_license,
              commercial_declared, status, sort_order
            ) VALUES (
              ${auth.membership!.tenantId},
              ${auth.domainUser.id},
              ${category[0].id},
              ${parsed.data.name},
              ${parsed.data.description ?? ''},
              ${parsed.data.imageMediaId ?? null},
              ${parsed.data.destinationKind},
              ${destination.url},
              ${parsed.data.actionLabel ?? null},
              ${parsed.data.commercialDeclared ? (parsed.data.benefitLabel ?? null) : null},
              ${parsed.data.commercialDeclared ? (parsed.data.benefitDescription ?? null) : null},
              ${parsed.data.commercialDeclared ? (parsed.data.promoCode ?? null) : null},
              ${parsed.data.commercialDeclared ? (parsed.data.benefitTerms ?? null) : null},
              ${parsed.data.commercialDeclared ? (parsed.data.benefitExpiresOn ?? null) : null},
              ${parsed.data.professionalLicense ?? null},
              ${parsed.data.commercialDeclared},
              'draft',
              ${sort[0]?.next ?? 1}
            )
            RETURNING id
          `;
          return rows[0]?.id;
        });
        return reply.code(201).send({ id: created, status: 'draft' });
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (message.includes('unknown_category') || message.includes('invalid_image')) {
          return reply
            .code(400)
            .send({ error: message.includes('image') ? 'invalid_image' : 'unknown_category' });
        }
        if (message.includes('too_many'))
          return reply.code(429).send({ error: 'too_many_recommendations' });
        throw error;
      }
    },
  );

  app.patch('/v1/recommendations/:id', async (request, reply) => {
    const auth = await authed(request);
    const rejected = deny(auth, reply, 'owner');
    if (rejected || !auth?.membership) return rejected;
    const id = IdSchema.safeParse((request.params as { id: string }).id);
    if (!id.success) return reply.code(400).send({ error: 'invalid_id' });
    const parsed = RecommendationWriteSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });
    const destination = normalizeDestination(
      parsed.data.destinationKind,
      parsed.data.destinationUrl,
    );
    if (!destination.ok) return reply.code(400).send({ error: destination.error });

    const updated = await withTenantContext(opts.appSql, ctx(auth), async (tx) => {
      const current = await tx<{ status: string; moderation_hidden_at: string | null }[]>`
        SELECT status, moderation_hidden_at FROM trainer_recommendations WHERE id = ${id.data}
      `;
      if (!current[0] || current[0].status === 'archived') return null;
      const category = await tx<{ id: string }[]>`
        SELECT id FROM recommendation_categories WHERE slug = ${parsed.data.categorySlug} AND active
      `;
      if (!category[0]) throw new Error('unknown_category');
      await tx`
        UPDATE trainer_recommendations SET
          category_id = ${category[0].id},
          name = ${parsed.data.name},
          description = ${parsed.data.description ?? ''},
          image_media_id = ${parsed.data.imageMediaId ?? null},
          destination_kind = ${parsed.data.destinationKind},
          destination_url = ${destination.url},
          action_label = ${parsed.data.actionLabel ?? null},
          benefit_label = ${parsed.data.commercialDeclared ? (parsed.data.benefitLabel ?? null) : null},
          benefit_description = ${parsed.data.commercialDeclared ? (parsed.data.benefitDescription ?? null) : null},
          promo_code = ${parsed.data.commercialDeclared ? (parsed.data.promoCode ?? null) : null},
          benefit_terms = ${parsed.data.commercialDeclared ? (parsed.data.benefitTerms ?? null) : null},
          benefit_expires_on = ${parsed.data.commercialDeclared ? (parsed.data.benefitExpiresOn ?? null) : null},
          professional_license = ${parsed.data.professionalLicense ?? null},
          commercial_declared = ${parsed.data.commercialDeclared},
          updated_at = now()
        WHERE id = ${id.data}
      `;
      return current[0].status;
    }).catch((error: unknown) => {
      if (error instanceof Error && error.message.includes('unknown_category'))
        return 'bad_category';
      throw error;
    });
    if (updated === 'bad_category') return reply.code(400).send({ error: 'unknown_category' });
    if (!updated) return reply.code(404).send({ error: 'not_found' });
    return { id: id.data, status: updated };
  });

  async function setStatus(
    request: Parameters<typeof resolveAuthContext>[0],
    reply: { code: (n: number) => { send: (b: unknown) => unknown } },
    idRaw: string,
    next: 'published' | 'hidden' | 'archived',
  ) {
    const auth = await authed(request);
    const rejected = deny(auth, reply, 'owner');
    if (rejected || !auth) return rejected;
    const id = IdSchema.safeParse(idRaw);
    if (!id.success) return reply.code(400).send({ error: 'invalid_id' });
    const row = await withTenantContext(opts.appSql, ctx(auth), async (tx) => {
      const current = await tx<{ status: string; moderation_hidden_at: Date | null }[]>`
        SELECT status, moderation_hidden_at FROM trainer_recommendations WHERE id = ${id.data}
      `;
      const item = current[0];
      if (!item || item.status === 'archived') return null;
      if (next === 'published' && item.moderation_hidden_at) {
        throw new Error('moderation_hidden');
      }
      await tx`
        UPDATE trainer_recommendations
        SET status = ${next}, updated_at = now()
        WHERE id = ${id.data}
      `;
      return next;
    }).catch((error: unknown) => {
      if (error instanceof Error && error.message.includes('moderation_hidden')) return 'blocked';
      throw error;
    });
    if (row === 'blocked') return reply.code(409).send({ error: 'hidden_by_moderation' });
    if (!row) return reply.code(404).send({ error: 'not_found' });
    return { id: id.data, status: next };
  }

  app.post('/v1/recommendations/:id/publish', async (request, reply) => {
    return setStatus(request, reply, (request.params as { id: string }).id, 'published');
  });
  app.post('/v1/recommendations/:id/hide', async (request, reply) => {
    return setStatus(request, reply, (request.params as { id: string }).id, 'hidden');
  });
  app.post('/v1/recommendations/:id/archive', async (request, reply) => {
    return setStatus(request, reply, (request.params as { id: string }).id, 'archived');
  });

  app.post('/v1/recommendations/reorder', async (request, reply) => {
    const auth = await authed(request);
    const rejected = deny(auth, reply, 'owner');
    if (rejected || !auth) return rejected;
    const parsed = RecommendationReorderSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });
    const unique = new Set(parsed.data.ids);
    if (unique.size !== parsed.data.ids.length) {
      return reply.code(400).send({ error: 'duplicate_ids' });
    }
    const ok = await withTenantContext(opts.appSql, ctx(auth), async (tx) => {
      const existing = await tx<{ id: string }[]>`
        SELECT id FROM trainer_recommendations WHERE status <> 'archived' ORDER BY sort_order
      `;
      const current = existing.map((row) => row.id).sort();
      const incoming = [...parsed.data.ids].sort();
      if (
        current.length !== incoming.length ||
        current.some((id, index) => id !== incoming[index])
      ) {
        return false;
      }
      for (let index = 0; index < parsed.data.ids.length; index += 1) {
        const id = parsed.data.ids[index];
        if (!id) continue;
        await tx`
          UPDATE trainer_recommendations
          SET sort_order = ${index + 1}, updated_at = now()
          WHERE id = ${id}
        `;
      }
      return true;
    });
    if (!ok) return reply.code(400).send({ error: 'reorder_mismatch' });
    return { reordered: true };
  });

  app.get('/v1/recommendations/:id', async (request, reply) => {
    const auth = await authed(request);
    if (!auth) return reply.code(401).send({ error: 'unauthorized' });
    if (!auth.membership) return reply.code(403).send({ error: 'forbidden' });
    const id = IdSchema.safeParse((request.params as { id: string }).id);
    if (!id.success) return reply.code(400).send({ error: 'invalid_id' });
    const rows = await withTenantContext(opts.appSql, ctx(auth), (tx) =>
      tx.unsafe<RecommendationRow[]>(
        `SELECT ${SELECT_LIST}
         FROM trainer_recommendations r
         JOIN recommendation_categories c ON c.id = r.category_id
         JOIN tenants t ON t.id = r.tenant_id
         LEFT JOIN trainer_profiles tp ON tp.tenant_id = t.id
         LEFT JOIN media_assets m ON m.id = r.image_media_id AND m.status = 'ready'
         WHERE r.id = $1`,
        [id.data],
      ),
    );
    const row = rows[0];
    if (!row) return reply.code(404).send({ error: 'not_found' });
    return present(row, opts.env, auth.membership.role === 'owner' ? 'trainer' : 'student');
  });

  app.post(
    '/v1/recommendations/:id/report',
    { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const auth = await authed(request);
      const rejected = deny(auth, reply, 'student');
      if (rejected || !auth?.membership) return rejected;
      const id = IdSchema.safeParse((request.params as { id: string }).id);
      if (!id.success) return reply.code(400).send({ error: 'invalid_id' });
      const parsed = RecommendationReportSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });
      try {
        const reportId = await withTenantContext(opts.appSql, ctx(auth), async (tx) => {
          const rows = await tx<{ id: string }[]>`
            INSERT INTO recommendation_reports (
              recommendation_id, tenant_id, reporter_user_id, reporter_membership_id, reason, details
            ) VALUES (
              ${id.data},
              ${auth.membership!.tenantId},
              ${auth.domainUser.id},
              ${auth.membership!.id},
              ${parsed.data.reason},
              ${parsed.data.details ?? ''}
            )
            RETURNING id
          `;
          return rows[0]?.id;
        });
        return reply.code(201).send({ id: reportId, status: 'open' });
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (message.includes('duplicate') || message.includes('unique')) {
          return reply.code(409).send({ error: 'already_reported' });
        }
        if (message.includes('row-level security') || message.includes('violates')) {
          return reply.code(404).send({ error: 'not_found' });
        }
        return reply.code(404).send({ error: 'not_found' });
      }
    },
  );
}
