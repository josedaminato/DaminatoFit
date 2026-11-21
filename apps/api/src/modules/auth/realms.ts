import { expo } from '@better-auth/expo';
import { brands, type RealmId } from '@daminatofit/brand';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer } from 'better-auth/plugins';
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

export function createAuthForRealm(realm: RealmId, db: Db, env: Env) {
  const schema = realmSchemas[realm];
  const brand = Object.values(brands).find((b) => b.authRealm === realm);
  if (!brand) {
    throw new Error(`No brand mapped to realm ${realm}`);
  }

  const trustedOrigins = [
    `${brand.scheme}://`,
    `${brand.scheme}://*`,
    env.API_PUBLIC_URL,
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
      // Public Better Auth sign-up stays available; trainer/student product rules
      // are enforced in our domain endpoints (and PupiApp blocks free trainer signup).
      minPasswordLength: 8,
      requireEmailVerification: env.NODE_ENV === 'production',
      sendResetPassword: async ({ user, url }) => {
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
    session: {
      expiresIn: 60 * 60 * 24 * 14,
      updateAge: 60 * 60 * 24,
      cookieCache: {
        enabled: false,
      },
    },
    advanced: {
      // Separate cookie names per realm so sessions never collide on one device.
      cookiePrefix: `ba_${realm}`,
    },
    plugins: [expo(), bearer()],
  });
}

export function createAuthRealms(db: Db, env: Env): Record<RealmId, AuthInstance> {
  return {
    daminatofit: createAuthForRealm('daminatofit', db, env),
    pupiapp: createAuthForRealm('pupiapp', db, env),
  };
}

export function isRealmId(value: string): value is RealmId {
  return value === 'daminatofit' || value === 'pupiapp';
}
