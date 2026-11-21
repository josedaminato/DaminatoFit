/**
 * Local-only platform admin provisioning.
 *
 * Usage:
 *   pnpm --filter @daminatofit/api admin:provision -- --email admin@example.com --password '...' --name 'Ops'
 *
 * Requires PLATFORM_ADMIN_PROVISION_SECRET in the environment (not committed).
 * Creates or reuses a DaminatoFit Better Auth user, ensures a domain user, then
 * grants platform_role = platform_admin. No default accounts. No public HTTP route.
 */
import { pathToFileURL } from 'node:url';
import { loadEnv, requireAuthSecret, requireDatabaseUrl } from './config/env';
import { closeDb, createDb } from './db/client';
import { createAuthRealms } from './modules/auth/realms';
import { recordAdminAudit } from './modules/admin/admin-auth';

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

async function main() {
  const email = argValue('--email')?.trim().toLowerCase();
  const password = argValue('--password');
  const name = argValue('--name')?.trim() || 'Platform Admin';
  const providedSecret = argValue('--secret') ?? process.env.PLATFORM_ADMIN_PROVISION_SECRET;

  if (!email || !password) {
    console.error('Required: --email and --password');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters');
    process.exit(1);
  }

  const env = loadEnv();
  if (!env.PLATFORM_ADMIN_PROVISION_SECRET) {
    console.error('PLATFORM_ADMIN_PROVISION_SECRET is not set');
    process.exit(1);
  }
  if (providedSecret !== env.PLATFORM_ADMIN_PROVISION_SECRET) {
    console.error('Invalid provision secret');
    process.exit(1);
  }

  requireAuthSecret(env);
  const databaseUrl = requireDatabaseUrl(env);
  const migrator = createDb(databaseUrl);
  const auths = createAuthRealms(migrator.db, env, migrator.sql);

  try {
    const existing = await migrator.sql<{ id: string }[]>`
      SELECT id FROM auth_daminatofit."user" WHERE lower(email) = ${email} LIMIT 1
    `;

    let authUserId = existing[0]?.id;
    if (!authUserId) {
      const created = await auths.daminatofit.api.signUpEmail({
        body: { email, password, name },
      });
      authUserId = created.user.id;
    }

    await migrator.sql`
      SELECT app.ensure_domain_user('daminatofit', ${authUserId}, ${name})
    `;

    const domain = await migrator.sql<{ id: string; platform_role: string }[]>`
      SELECT id, platform_role
      FROM users
      WHERE realm = 'daminatofit' AND auth_user_id = ${authUserId}
      LIMIT 1
    `;
    const userId = domain[0]?.id;
    if (!userId) throw new Error('domain user missing after ensure');

    if (domain[0]?.platform_role !== 'platform_admin') {
      await migrator.sql`SELECT app.grant_platform_admin(${userId}::uuid)`;
    }

    await recordAdminAudit(migrator.sql, {
      actorUserId: userId,
      action: 'admin.provision',
      resourceType: 'user',
      resourceId: userId,
      result: 'success',
      reason: 'local_cli',
      metadata: { email },
    });

    console.log(
      JSON.stringify({
        status: 'ok',
        userId,
        email,
        platformRole: 'platform_admin',
        mfa: 'not_enabled_block_before_internet_exposure',
      }),
    );
  } finally {
    await closeDb(migrator);
  }
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntry) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
