import type { RealmId } from '@daminatofit/brand';
import type { FastifyInstance } from 'fastify';
import type { Sql } from 'postgres';
import { z } from 'zod';
import type { Env } from '../../config/env';
import { withTenantContext } from '../../db/tenant-tx';
import { invitationEmail, sendMail } from '../../lib/mail';
import type { AuthInstance } from '../auth/realms';
import { fromFastifyHeaders, resolveAuthContext } from '../auth/session';
import { hashToken, newInviteToken } from '../trainers/trainers.service';

const CreateInvitationSchema = z.object({
  email: z.string().trim().email().max(320),
});

const AcceptInvitationSchema = z.object({
  token: z.string().min(20),
  name: z.string().trim().min(1).max(120).optional(),
  password: z.string().min(8).max(128).optional(),
});

function forwardAuthHeaders(
  reply: { header: (k: string, v: string) => unknown },
  headers: Headers | undefined,
) {
  if (!headers) return;
  const cookies = headers.getSetCookie?.() ?? [];
  for (const cookie of cookies) reply.header('set-cookie', cookie);
  const authToken = headers.get('set-auth-token');
  if (authToken) reply.header('set-auth-token', authToken);
}

async function findAuthUserByEmail(
  sql: Sql,
  realm: RealmId,
  email: string,
): Promise<{ id: string; name: string; email: string } | null> {
  const schema = realm === 'daminatofit' ? 'auth_daminatofit' : 'auth_pupiapp';
  const rows = await sql.unsafe(
    `SELECT id, name, email FROM ${schema}."user" WHERE lower(email) = lower($1) LIMIT 1`,
    [email],
  );
  const row = rows[0] as { id: string; name: string; email: string } | undefined;
  return row ?? null;
}

export async function invitationsRoutes(
  app: FastifyInstance,
  opts: {
    auths: Record<RealmId, AuthInstance>;
    appSql: Sql;
    migratorSql: Sql;
    env: Env;
  },
): Promise<void> {
  app.post('/v1/invitations', async (request, reply) => {
    const auth = await resolveAuthContext(request, opts.auths, opts.appSql);
    if (!auth?.membership || auth.membership.role !== 'owner') {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const parsed = CreateInvitationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body' });
    }

    const token = newInviteToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
    const ctx = {
      realm: auth.realm,
      userId: auth.domainUser.id,
      tenantId: auth.membership.tenantId,
      membershipId: auth.membership.id,
      role: 'owner' as const,
    };

    try {
      const created = await withTenantContext(
        opts.appSql,
        ctx,
        async (tx) =>
          tx<{ id: string }[]>`
          INSERT INTO invitations (tenant_id, email, role, token_hash, expires_at, created_by)
          VALUES (
            ${auth.membership!.tenantId},
            ${parsed.data.email.toLowerCase()},
            'student',
            ${tokenHash},
            ${expiresAt.toISOString()},
            ${auth.domainUser.id}
          )
          RETURNING id
        `,
      );

      const linkBase =
        auth.brandId === 'pupiapp'
          ? opts.env.APP_LINK_BASE_PUPIAPP
          : opts.env.APP_LINK_BASE_DAMINATOFIT;
      const url = `${linkBase}?token=${encodeURIComponent(token)}`;

      const profile = await withTenantContext(
        opts.appSql,
        ctx,
        async (tx) =>
          tx<{ display_name: string }[]>`
          SELECT display_name FROM trainer_profiles
          WHERE tenant_id = ${auth.membership!.tenantId}
        `,
      );

      const mail = invitationEmail(
        auth.brandId,
        profile[0]?.display_name ?? auth.domainUser.displayName,
        url,
      );
      mail.to = parsed.data.email;
      await sendMail(opts.env, mail);

      return reply.code(201).send({
        id: created[0]?.id,
        email: parsed.data.email.toLowerCase(),
        expiresAt: expiresAt.toISOString(),
        inviteUrl: url,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (/unique|duplicate/i.test(message)) {
        return reply.code(409).send({ error: 'invitation_exists' });
      }
      request.log.error(error);
      return reply.code(400).send({ error: 'invitation_failed' });
    }
  });

  app.get('/v1/invitations', async (request, reply) => {
    const auth = await resolveAuthContext(request, opts.auths, opts.appSql);
    if (!auth?.membership || auth.membership.role !== 'owner') {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const rows = await withTenantContext(
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
            id: string;
            email: string;
            expires_at: string;
            accepted_at: string | null;
            revoked_at: string | null;
            created_at: string;
          }[]
        >`
          SELECT id, email, expires_at, accepted_at, revoked_at, created_at
          FROM invitations
          WHERE tenant_id = ${auth.membership!.tenantId}
          ORDER BY created_at DESC
        `,
    );

    return {
      invitations: rows.map((row) => ({
        id: row.id,
        email: row.email,
        expiresAt: row.expires_at,
        acceptedAt: row.accepted_at,
        revokedAt: row.revoked_at,
        createdAt: row.created_at,
        status: row.accepted_at
          ? 'accepted'
          : row.revoked_at
            ? 'revoked'
            : new Date(row.expires_at) < new Date()
              ? 'expired'
              : 'pending',
      })),
    };
  });

  app.post('/v1/invitations/:id/revoke', async (request, reply) => {
    const auth = await resolveAuthContext(request, opts.auths, opts.appSql);
    if (!auth?.membership || auth.membership.role !== 'owner') {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const id = (request.params as { id: string }).id;

    const updated = await withTenantContext(
      opts.appSql,
      {
        realm: auth.realm,
        userId: auth.domainUser.id,
        tenantId: auth.membership.tenantId,
        membershipId: auth.membership.id,
        role: 'owner',
      },
      async (tx) =>
        tx<{ id: string }[]>`
          UPDATE invitations
          SET revoked_at = now(), updated_at = now()
          WHERE id = ${id}
            AND tenant_id = ${auth.membership!.tenantId}
            AND accepted_at IS NULL
            AND revoked_at IS NULL
          RETURNING id
        `,
    );

    if (!updated[0]) return reply.code(404).send({ error: 'not_found' });
    return { id: updated[0].id, status: 'revoked' };
  });

  app.get('/v1/invitations/preview', async (request, reply) => {
    const token = (request.query as { token?: string }).token;
    if (!token) return reply.code(400).send({ error: 'token_required' });

    const brandHeader = request.headers['x-app-brand'];
    const brandId = typeof brandHeader === 'string' ? brandHeader : '';
    if (brandId !== 'daminatofit' && brandId !== 'pupiapp') {
      return reply.code(400).send({ error: 'brand_required' });
    }

    const rows = await opts.migratorSql<
      {
        email: string;
        expires_at: string;
        accepted_at: string | null;
        revoked_at: string | null;
        trainer_name: string;
        brand_slug: string;
      }[]
    >`
      SELECT i.email, i.expires_at, i.accepted_at, i.revoked_at,
             tp.display_name AS trainer_name, b.slug AS brand_slug
      FROM invitations i
      JOIN tenants t ON t.id = i.tenant_id
      JOIN brands b ON b.id = t.brand_id
      JOIN trainer_profiles tp ON tp.tenant_id = t.id
      WHERE i.token_hash = ${hashToken(token)}
      LIMIT 1
    `;

    const row = rows[0];
    if (!row || row.brand_slug !== brandId) {
      return reply.code(404).send({ error: 'invitation_not_found' });
    }

    return {
      email: row.email,
      trainerName: row.trainer_name,
      brandId: row.brand_slug,
      status: row.accepted_at
        ? 'accepted'
        : row.revoked_at
          ? 'revoked'
          : new Date(row.expires_at) < new Date()
            ? 'expired'
            : 'pending',
      expiresAt: row.expires_at,
    };
  });

  app.post(
    '/v1/invitations/accept',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const brandHeader = request.headers['x-app-brand'];
      const brandId = typeof brandHeader === 'string' ? brandHeader : '';
      if (brandId !== 'daminatofit' && brandId !== 'pupiapp') {
        return reply.code(400).send({ error: 'brand_required' });
      }

      const parsed = AcceptInvitationSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_body' });
      }

      const realm = brandId as RealmId;
      const authApi = opts.auths[realm];
      const tokenHash = hashToken(parsed.data.token);

      const invite = await opts.migratorSql<{ email: string; brand_slug: string }[]>`
        SELECT i.email, b.slug AS brand_slug
        FROM invitations i
        JOIN tenants t ON t.id = i.tenant_id
        JOIN brands b ON b.id = t.brand_id
        WHERE i.token_hash = ${tokenHash}
        LIMIT 1
      `;
      if (!invite[0] || invite[0].brand_slug !== brandId) {
        return reply.code(404).send({ error: 'invitation_not_found' });
      }

      let authUserId: string | null = null;
      let displayName = parsed.data.name ?? 'Alumno';

      const existingSession = await authApi.api.getSession({
        headers: fromFastifyHeaders(request),
      });

      if (existingSession) {
        authUserId = existingSession.user.id;
        displayName = parsed.data.name ?? existingSession.user.name;
        if (existingSession.user.email.toLowerCase() !== invite[0].email.toLowerCase()) {
          return reply.code(403).send({ error: 'invitation_email_mismatch' });
        }
      } else {
        const existing = await findAuthUserByEmail(opts.migratorSql, realm, invite[0].email);

        if (existing) {
          if (!parsed.data.password) {
            return reply.code(401).send({ error: 'authentication_required' });
          }
          try {
            const signedIn = await authApi.api.signInEmail({
              body: { email: invite[0].email, password: parsed.data.password },
              returnHeaders: true,
            });
            forwardAuthHeaders(reply, (signedIn as { headers?: Headers }).headers);
            authUserId = existing.id;
            displayName = parsed.data.name ?? existing.name;
          } catch {
            return reply.code(401).send({ error: 'invalid_credentials' });
          }
        } else {
          if (!parsed.data.password || !parsed.data.name) {
            return reply.code(400).send({ error: 'registration_required' });
          }
          try {
            const signedUp = await authApi.api.signUpEmail({
              body: {
                email: invite[0].email,
                password: parsed.data.password,
                name: parsed.data.name,
              },
              returnHeaders: true,
            });
            forwardAuthHeaders(reply, (signedUp as { headers?: Headers }).headers);

            const schema = realm === 'daminatofit' ? 'auth_daminatofit' : 'auth_pupiapp';
            await opts.migratorSql.unsafe(
              `UPDATE ${schema}."user" SET email_verified = true WHERE lower(email) = lower($1)`,
              [invite[0].email],
            );

            const created = await findAuthUserByEmail(opts.migratorSql, realm, invite[0].email);
            if (!created) return reply.code(400).send({ error: 'signup_failed' });
            authUserId = created.id;
            displayName = parsed.data.name;
          } catch (error) {
            request.log.error(error);
            return reply.code(400).send({ error: 'signup_failed' });
          }
        }
      }

      if (!authUserId) return reply.code(401).send({ error: 'authentication_required' });

      try {
        const accepted = await opts.appSql<
          {
            user_id: string;
            tenant_id: string;
            membership_id: string;
            invitation_id: string;
          }[]
        >`
          SELECT * FROM app.accept_invitation(
            ${tokenHash},
            ${realm},
            ${authUserId},
            ${displayName},
            ${invite[0].email}
          )
        `;

        return {
          userId: accepted[0]?.user_id,
          tenantId: accepted[0]?.tenant_id,
          membershipId: accepted[0]?.membership_id,
          invitationId: accepted[0]?.invitation_id,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'accept_failed';
        if (message.includes('invitation_expired')) {
          return reply.code(410).send({ error: 'invitation_expired' });
        }
        if (message.includes('invitation_revoked')) {
          return reply.code(410).send({ error: 'invitation_revoked' });
        }
        if (message.includes('invitation_already_used')) {
          return reply.code(409).send({ error: 'invitation_already_used' });
        }
        if (message.includes('invitation_realm_mismatch')) {
          return reply.code(403).send({ error: 'invitation_realm_mismatch' });
        }
        if (message.includes('invitation_email_mismatch')) {
          return reply.code(403).send({ error: 'invitation_email_mismatch' });
        }
        request.log.error(error);
        return reply.code(400).send({ error: 'accept_failed' });
      }
    },
  );
}
