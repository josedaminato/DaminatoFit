import { brands, type RealmId } from '@daminatofit/brand';
import type { FastifyInstance } from 'fastify';
import type { Sql } from 'postgres';
import { z } from 'zod';
import type { Env } from '../../config/env';
import type { AuthInstance } from '../auth/realms';
import { resolveAuthContext } from '../auth/session';
import { deleteAuthUser } from './trainers.service';

const RegisterTrainerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(320),
  password: z.string().min(8).max(128),
  businessName: z.string().trim().min(1).max(120),
});

const BootstrapPupiSchema = z.object({
  secret: z.string().min(16),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(320),
  password: z.string().min(8).max(128),
  businessName: z.string().trim().min(1).max(120).default('PupiApp'),
});

function forwardSetCookie(reply: { header: (k: string, v: string) => unknown }, headers: Headers) {
  const cookies = headers.getSetCookie?.() ?? [];
  for (const cookie of cookies) {
    reply.header('set-cookie', cookie);
  }
  const single = headers.get('set-cookie');
  if (single && cookies.length === 0) {
    reply.header('set-cookie', single);
  }
  const authToken = headers.get('set-auth-token');
  if (authToken) {
    reply.header('set-auth-token', authToken);
  }
}

export async function trainersRoutes(
  app: FastifyInstance,
  opts: {
    auths: Record<RealmId, AuthInstance>;
    appSql: Sql;
    migratorSql: Sql;
    env: Env;
  },
): Promise<void> {
  app.post(
    '/v1/trainers/register',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const brandHeader = request.headers['x-app-brand'];
      const brandId = typeof brandHeader === 'string' ? brandHeader : '';
      if (brandId !== 'daminatofit') {
        return reply.code(403).send({ error: 'trainer_signup_closed' });
      }
      if (brands.daminatofit.trainerSignup !== 'open') {
        return reply.code(403).send({ error: 'trainer_signup_closed' });
      }

      const parsed = RegisterTrainerSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
      }

      const auth = opts.auths.daminatofit;
      let authUserId: string | null = null;

      try {
        const signedUp = await auth.api.signUpEmail({
          body: {
            email: parsed.data.email,
            password: parsed.data.password,
            name: parsed.data.name,
          },
          returnHeaders: true,
        });

        const result = signedUp as unknown as {
          user?: { id: string };
          response?: { user: { id: string } };
          headers?: Headers;
        };

        authUserId =
          result.response?.user?.id ??
          result.user?.id ??
          (
            await opts.migratorSql<{ id: string }[]>`
              SELECT id FROM auth_daminatofit."user" WHERE email = ${parsed.data.email.toLowerCase()} LIMIT 1
            `
          )[0]?.id ??
          null;

        if (!authUserId) {
          return reply.code(400).send({ error: 'signup_failed' });
        }

        const provisioned = await opts.appSql<
          { user_id: string; tenant_id: string; membership_id: string }[]
        >`
          SELECT * FROM app.provision_trainer(
            ${'daminatofit'},
            ${authUserId},
            ${parsed.data.name},
            ${'daminatofit'},
            ${parsed.data.businessName}
          )
        `;

        if (result.headers) forwardSetCookie(reply, result.headers);

        return reply.code(201).send({
          userId: provisioned[0]?.user_id,
          tenantId: provisioned[0]?.tenant_id,
          membershipId: provisioned[0]?.membership_id,
        });
      } catch (error) {
        if (authUserId) {
          await deleteAuthUser(opts.migratorSql, 'daminatofit', authUserId).catch(() => undefined);
        }
        const message = error instanceof Error ? error.message : 'signup_failed';
        if (/unique|duplicate|already/i.test(message)) {
          return reply.code(409).send({ error: 'email_taken' });
        }
        request.log.error(error);
        return reply.code(400).send({ error: 'signup_failed' });
      }
    },
  );

  app.post(
    '/v1/admin/bootstrap-pupiapp',
    {
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const parsed = BootstrapPupiSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_body' });
      }
      if (
        !opts.env.PUPIAPP_BOOTSTRAP_SECRET ||
        parsed.data.secret !== opts.env.PUPIAPP_BOOTSTRAP_SECRET
      ) {
        return reply.code(403).send({ error: 'forbidden' });
      }

      const existing = await opts.migratorSql<{ n: number }[]>`
        SELECT count(*)::int AS n
        FROM tenants t
        JOIN brands b ON b.id = t.brand_id
        WHERE b.slug = 'pupiapp'
      `;
      if ((existing[0]?.n ?? 0) > 0) {
        return reply.code(200).send({ status: 'already_bootstrapped' });
      }

      const auth = opts.auths.pupiapp;
      let authUserId: string | null = null;
      try {
        await auth.api.signUpEmail({
          body: {
            email: parsed.data.email,
            password: parsed.data.password,
            name: parsed.data.name,
          },
        });
        authUserId =
          (
            await opts.migratorSql<{ id: string }[]>`
              SELECT id FROM auth_pupiapp."user" WHERE email = ${parsed.data.email.toLowerCase()} LIMIT 1
            `
          )[0]?.id ?? null;
        if (!authUserId) return reply.code(400).send({ error: 'bootstrap_failed' });

        // Mark verified for the bootstrap account so the owner can sign in immediately in local/dev.
        await opts.migratorSql`
          UPDATE auth_pupiapp."user" SET email_verified = true WHERE id = ${authUserId}
        `;

        const provisioned = await opts.appSql<
          { user_id: string; tenant_id: string; membership_id: string }[]
        >`
          SELECT * FROM app.provision_trainer(
            ${'pupiapp'},
            ${authUserId},
            ${parsed.data.name},
            ${'pupiapp'},
            ${parsed.data.businessName}
          )
        `;

        return reply.code(201).send({
          status: 'created',
          userId: provisioned[0]?.user_id,
          tenantId: provisioned[0]?.tenant_id,
          membershipId: provisioned[0]?.membership_id,
        });
      } catch (error) {
        if (authUserId) {
          await deleteAuthUser(opts.migratorSql, 'pupiapp', authUserId).catch(() => undefined);
        }
        request.log.error(error);
        return reply.code(400).send({ error: 'bootstrap_failed' });
      }
    },
  );

  app.get('/v1/trainer/students', async (request, reply) => {
    const auth = await resolveAuthContext(request, opts.auths, opts.appSql);
    if (!auth?.membership || auth.membership.role !== 'owner') {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const { withTenantContext } = await import('../../db/tenant-tx');
    const students = await withTenantContext(
      opts.appSql,
      {
        realm: auth.realm,
        userId: auth.domainUser.id,
        tenantId: auth.membership.tenantId,
        membershipId: auth.membership.id,
        role: 'owner',
      },
      async (tx) =>
        tx<
          {
            membership_id: string;
            user_id: string;
            display_name: string;
            status: string;
            activated_at: string | null;
          }[]
        >`
          SELECT m.id AS membership_id, u.id AS user_id, u.display_name, m.status, m.activated_at
          FROM memberships m
          JOIN users u ON u.id = m.user_id
          WHERE m.tenant_id = ${auth.membership!.tenantId}
            AND m.role = 'student'
          ORDER BY u.display_name
        `,
    );

    return { students };
  });
}
