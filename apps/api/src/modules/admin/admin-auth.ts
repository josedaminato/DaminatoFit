import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Sql } from 'postgres';
import type { AuthInstance } from '../auth/realms';
import { resolveAuthContext, type AuthContext } from '../auth/session';

export async function requirePlatformAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
  auths: Record<string, AuthInstance>,
  appSql: Sql,
  migratorSql: Sql,
  options?: { logDenied?: boolean },
): Promise<AuthContext | null> {
  const auth = await resolveAuthContext(request, auths as never, appSql);
  if (!auth) {
    await reply.code(401).send({ error: 'unauthorized' });
    return null;
  }

  const allowed =
    auth.brandId === 'daminatofit' &&
    auth.realm === 'daminatofit' &&
    auth.domainUser.platformRole === 'platform_admin' &&
    auth.domainUser.status === 'active';

  if (!allowed) {
    if (options?.logDenied !== false) {
      try {
        await migratorSql`
          SELECT app.write_platform_admin_audit(
            ${auth.domainUser.id}::uuid,
            ${'admin.access_denied'},
            ${'admin_api'},
            NULL,
            ${'denied'},
            ${'not_platform_admin'},
            ${JSON.stringify({ path: request.url, brandId: auth.brandId })}::jsonb
          )
        `;
      } catch {
        // Audit insert must never block the 403 response.
      }
    }
    await reply.code(403).send({ error: 'forbidden' });
    return null;
  }

  return auth;
}

export async function recordAdminAudit(
  migratorSql: Sql,
  input: {
    actorUserId: string;
    action: string;
    resourceType: string;
    resourceId?: string | null;
    result: 'success' | 'denied' | 'error';
    reason?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  await migratorSql`
    SELECT app.write_platform_admin_audit(
      ${input.actorUserId}::uuid,
      ${input.action},
      ${input.resourceType},
      ${input.resourceId ?? null}::uuid,
      ${input.result},
      ${input.reason ?? null},
      ${JSON.stringify(input.metadata ?? {})}::jsonb
    )
  `;
}
