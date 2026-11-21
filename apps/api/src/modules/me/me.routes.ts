import type { FastifyInstance } from 'fastify';
import type { Sql } from 'postgres';
import type { AuthInstance } from '../auth/realms';
import type { RealmId } from '@daminatofit/brand';
import { fromFastifyHeaders, resolveAuthContext } from '../auth/session';
import { withTenantContext } from '../../db/tenant-tx';
import { z } from 'zod';

const UpdateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  bio: z.string().trim().max(2000).nullable().optional(),
  whatsappE164: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{7,14}$/, 'WhatsApp must be E.164 (+54911...)')
    .nullable()
    .optional(),
});

export async function meRoutes(
  app: FastifyInstance,
  opts: { auths: Record<RealmId, AuthInstance>; appSql: Sql },
): Promise<void> {
  app.get('/v1/me', async (request, reply) => {
    const auth = await resolveAuthContext(request, opts.auths, opts.appSql);
    if (!auth) return reply.code(401).send({ error: 'unauthorized' });

    const memberships = await opts.appSql<
      {
        id: string;
        tenant_id: string;
        role: string;
        status: string;
        tenant_name: string;
        brand_slug: string;
      }[]
    >`SELECT * FROM app.list_memberships_for_user(${auth.domainUser.id})`;

    return {
      user: {
        id: auth.domainUser.id,
        email: auth.email,
        displayName: auth.domainUser.displayName,
        realm: auth.realm,
        brandId: auth.brandId,
      },
      memberships: memberships.map((m) => ({
        id: m.id,
        tenantId: m.tenant_id,
        role: m.role,
        status: m.status,
        tenantName: m.tenant_name,
        brandId: m.brand_slug,
      })),
      activeTenantId: auth.membership?.tenantId ?? null,
    };
  });

  app.patch('/v1/me/trainer-profile', async (request, reply) => {
    const auth = await resolveAuthContext(request, opts.auths, opts.appSql);
    if (!auth?.membership || auth.membership.role !== 'owner') {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const parsed = UpdateProfileSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    }

    const body = parsed.data;
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
        if (body.displayName) {
          await tx`
          UPDATE users SET display_name = ${body.displayName}, updated_at = now()
          WHERE id = ${auth.domainUser.id}
        `;
          await tx`
          UPDATE trainer_profiles
          SET display_name = ${body.displayName}, updated_at = now()
          WHERE tenant_id = ${auth.membership!.tenantId}
        `;
        }
        if (body.bio !== undefined) {
          await tx`
          UPDATE trainer_profiles
          SET bio = ${body.bio}, updated_at = now()
          WHERE tenant_id = ${auth.membership!.tenantId}
        `;
        }
        if (body.whatsappE164 !== undefined) {
          await tx`
          UPDATE trainer_profiles
          SET whatsapp_e164 = ${body.whatsappE164}, updated_at = now()
          WHERE tenant_id = ${auth.membership!.tenantId}
        `;
        }
      },
    );

    const profile = await withTenantContext(
      opts.appSql,
      {
        realm: auth.realm,
        userId: auth.domainUser.id,
        tenantId: auth.membership.tenantId,
        membershipId: auth.membership.id,
        role: 'owner',
      },
      async (tx) =>
        tx<{ display_name: string; bio: string | null; whatsapp_e164: string | null }[]>`
          SELECT display_name, bio, whatsapp_e164
          FROM trainer_profiles
          WHERE tenant_id = ${auth.membership!.tenantId}
        `,
    );

    return {
      profile: {
        displayName: profile[0]?.display_name,
        bio: profile[0]?.bio ?? null,
        whatsappE164: profile[0]?.whatsapp_e164 ?? null,
      },
    };
  });

  app.get('/v1/me/trainer-profile', async (request, reply) => {
    const auth = await resolveAuthContext(request, opts.auths, opts.appSql);
    if (!auth?.membership) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    const profile = await withTenantContext(
      opts.appSql,
      {
        realm: auth.realm,
        userId: auth.domainUser.id,
        tenantId: auth.membership.tenantId,
        membershipId: auth.membership.id,
        role: auth.membership.role,
      },
      async (tx) =>
        tx<{ display_name: string; bio: string | null; whatsapp_e164: string | null }[]>`
          SELECT display_name, bio, whatsapp_e164
          FROM trainer_profiles
          WHERE tenant_id = ${auth.membership!.tenantId}
        `,
    );

    if (!profile[0]) return reply.code(404).send({ error: 'not_found' });

    return {
      profile: {
        displayName: profile[0].display_name,
        bio: profile[0].bio,
        whatsappE164: profile[0].whatsapp_e164,
        whatsappUrl: profile[0].whatsapp_e164
          ? `https://wa.me/${profile[0].whatsapp_e164.replace('+', '')}`
          : null,
      },
    };
  });

  const DeleteAccountSchema = z.object({
    password: z.string().min(8).max(128),
    confirm: z.literal('ELIMINAR'),
  });

  app.post(
    '/v1/me/account/delete',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const auth = await resolveAuthContext(request, opts.auths, opts.appSql);
      if (!auth) return reply.code(401).send({ error: 'unauthorized' });

      const parsed = DeleteAccountSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_body' });
      }

      try {
        await opts.auths[auth.realm].api.deleteUser({
          body: { password: parsed.data.password },
          headers: fromFastifyHeaders(request),
        });
        return { status: 'deleted' };
      } catch (error) {
        request.log.error(error);
        return reply.code(400).send({ error: 'delete_failed' });
      }
    },
  );
}
