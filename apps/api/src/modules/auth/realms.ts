import { expo } from '@better-auth/expo';
import { brands, type RealmId } from '@daminatofit/brand';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer } from 'better-auth/plugins';
import type { Sql } from 'postgres';
import type { Env } from '../../config/env';
import { requireAuthSecret } from '../../config/env';
import type { Db } from '../../db/client';
import { authDaminatofit, authPupiapp } from '../../db/schema/auth-tables';
import { resetPasswordEmail, sendMail, verificationEmail } from '../../lib/mail';

const realmSchemas = {
  daminatofit: authDaminatofit,
  pupiapp: authPupiapp,
} as const;

export type AuthInstance = ReturnType<typeof createAuthForRealm>;

/** Captures reset tokens in test runs (raw token, never logged in production). */
export const testResetTokens = new Map<string, string>();

export function createAuthForRealm(realm: RealmId, db: Db, env: Env, domainSql: Sql) {
  const schema = realmSchemas[realm];
  const brand = Object.values(brands).find((b) => b.authRealm === realm);
  if (!brand) {
    throw new Error(`No brand mapped to realm ${realm}`);
  }

  const adminOrigins = env.ADMIN_WEB_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const trustedOrigins = [
    `${brand.scheme}://`,
    `${brand.scheme}://*`,
    env.API_PUBLIC_URL,
    ...(realm === 'daminatofit' ? adminOrigins : []),
    ...(env.NODE_ENV === 'development'
      ? ['exp://', 'exp://**', 'http://127.0.0.1:8081', 'http://localhost:8081']
      : []),
  ];

  return betterAuth({
    appName: brand.displayName,
    baseURL: env.API_PUBLIC_URL,
    basePath: `/auth/${realm}`,
    secret: requireAuthSecret(env),
    trustedOrigins,
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
      schemaName: `auth_${realm}`,
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      requireEmailVerification: env.NODE_ENV === 'production',
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url, token }) => {
        if (env.NODE_ENV === 'test') {
          testResetTokens.set(`${realm}:${user.email.toLowerCase()}`, token);
        }
        const message = resetPasswordEmail(brand.id, url);
        message.to = user.email;
        await sendMail(env, message);
      },
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        const message = verificationEmail(brand.id, url);
        message.to = user.email;
        await sendMail(env, message);
      },
      sendOnSignUp: true,
    },
    user: {
      deleteUser: {
        enabled: true,
        beforeDelete: async (user) => {
          await domainSql`SELECT app.soft_delete_identity(${realm}, ${user.id})`;
        },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 14,
      updateAge: 60 * 60 * 24,
      freshAge: 60 * 60 * 24,
      cookieCache: {
        enabled: false,
      },
    },
    advanced: {
      cookiePrefix: `ba_${realm}`,
    },
    plugins: [expo(), bearer()],
  });
}

export function createAuthRealms(db: Db, env: Env, domainSql: Sql): Record<RealmId, AuthInstance> {
  return {
    daminatofit: createAuthForRealm('daminatofit', db, env, domainSql),
    pupiapp: createAuthForRealm('pupiapp', db, env, domainSql),
  };
}

export function isRealmId(value: string): value is RealmId {
  return value === 'daminatofit' || value === 'pupiapp';
}
