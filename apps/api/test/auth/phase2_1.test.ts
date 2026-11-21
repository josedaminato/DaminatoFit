import { APP_BRAND_HEADER, TENANT_ID_HEADER } from '@daminatofit/contracts';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app';
import { loadEnv } from '../../src/config/env';
import { closeDb, type DbHandles } from '../../src/db/client';
import { testResetTokens } from '../../src/modules/auth/realms';
import { openMigratorDb, resetDatabase } from '../db';

function authHeaders(brand: string, cookie?: string, tenantId?: string, bearer?: string) {
  const headers: Record<string, string> = { [APP_BRAND_HEADER]: brand };
  if (cookie) headers.cookie = cookie;
  if (tenantId) headers[TENANT_ID_HEADER] = tenantId;
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  return headers;
}

function pickSession(response: { headers: Record<string, string | string[] | undefined> }): {
  cookie?: string;
  bearer?: string;
} {
  const setCookie = response.headers['set-cookie'];
  const cookie = Array.isArray(setCookie) ? setCookie.join('; ') : setCookie;
  const bearer = response.headers['set-auth-token'];
  return {
    cookie: typeof cookie === 'string' ? cookie : undefined,
    bearer: typeof bearer === 'string' ? bearer : undefined,
  };
}

describe('Phase 2.1 — password reset and account deletion', () => {
  let app: FastifyInstance;
  let migrator: DbHandles;

  beforeAll(async () => {
    await resetDatabase();
    migrator = await openMigratorDb();
    const env = loadEnv({
      ...process.env,
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      BETTER_AUTH_SECRET:
        process.env.BETTER_AUTH_SECRET ?? 'test_secret_daminatofit_phase2_32chars!',
      PUPIAPP_BOOTSTRAP_SECRET: 'test_pupiapp_bootstrap_secret',
    });
    const built = await buildApp(env);
    app = built.app;

    await app.inject({
      method: 'POST',
      url: '/v1/trainers/register',
      headers: authHeaders('daminatofit'),
      payload: {
        name: 'Reset Coach',
        email: 'reset-coach@example.com',
        password: 'password123',
        businessName: 'Reset Gym',
      },
    });
  });

  afterAll(async () => {
    await app.close();
    await closeDb(migrator);
  });

  it('resets password with a one-time token and rejects reuse', async () => {
    testResetTokens.clear();
    const requested = await app.inject({
      method: 'POST',
      url: '/auth/daminatofit/request-password-reset',
      headers: { 'content-type': 'application/json' },
      payload: {
        email: 'reset-coach@example.com',
        redirectTo: 'daminatofit://reset-password',
      },
    });
    expect(requested.statusCode).toBeLessThan(400);

    const token = testResetTokens.get('daminatofit:reset-coach@example.com');
    expect(token).toBeTruthy();

    const reset = await app.inject({
      method: 'POST',
      url: '/auth/daminatofit/reset-password',
      headers: { 'content-type': 'application/json' },
      payload: { newPassword: 'password456', token },
    });
    expect(reset.statusCode).toBeLessThan(400);

    const oldLogin = await app.inject({
      method: 'POST',
      url: '/auth/daminatofit/sign-in/email',
      headers: { 'content-type': 'application/json' },
      payload: { email: 'reset-coach@example.com', password: 'password123' },
    });
    expect(oldLogin.statusCode).toBeGreaterThanOrEqual(400);

    const newLogin = await app.inject({
      method: 'POST',
      url: '/auth/daminatofit/sign-in/email',
      headers: { 'content-type': 'application/json' },
      payload: { email: 'reset-coach@example.com', password: 'password456' },
    });
    expect(newLogin.statusCode).toBeLessThan(400);

    const reuse = await app.inject({
      method: 'POST',
      url: '/auth/daminatofit/reset-password',
      headers: { 'content-type': 'application/json' },
      payload: { newPassword: 'password789', token },
    });
    expect(reuse.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('rejects an expired or bogus reset token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/daminatofit/reset-password',
      headers: { 'content-type': 'application/json' },
      payload: { newPassword: 'password999', token: 'not-a-real-token' },
    });
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('keeps password reset tokens scoped to the realm', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/admin/bootstrap-pupiapp',
      payload: {
        secret: 'test_pupiapp_bootstrap_secret',
        name: 'Pupi',
        email: 'pupi-reset@example.com',
        password: 'password123',
        businessName: 'Pupi',
      },
    });

    testResetTokens.clear();
    await app.inject({
      method: 'POST',
      url: '/auth/pupiapp/request-password-reset',
      headers: { 'content-type': 'application/json' },
      payload: {
        email: 'pupi-reset@example.com',
        redirectTo: 'pupiapp://reset-password',
      },
    });

    const pupiToken = testResetTokens.get('pupiapp:pupi-reset@example.com');
    expect(pupiToken).toBeTruthy();

    const cross = await app.inject({
      method: 'POST',
      url: '/auth/daminatofit/reset-password',
      headers: { 'content-type': 'application/json' },
      payload: { newPassword: 'password999', token: pupiToken },
    });
    expect(cross.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('deletes the account with password confirmation and revokes access', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/trainers/register',
      headers: authHeaders('daminatofit'),
      payload: {
        name: 'Delete Me',
        email: 'delete-me@example.com',
        password: 'password123',
        businessName: 'Delete Gym',
      },
    });

    const signIn = await app.inject({
      method: 'POST',
      url: '/auth/daminatofit/sign-in/email',
      headers: { 'content-type': 'application/json' },
      payload: { email: 'delete-me@example.com', password: 'password123' },
    });
    const session = pickSession(signIn);
    expect(session.cookie || session.bearer).toBeTruthy();

    const me = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: authHeaders('daminatofit', session.cookie, undefined, session.bearer),
    });
    expect(me.statusCode).toBe(200);
    const userId = me.json().user.id as string;
    const tenantId = me.json().memberships[0].tenantId as string;

    const badConfirm = await app.inject({
      method: 'POST',
      url: '/v1/me/account/delete',
      headers: authHeaders('daminatofit', session.cookie, tenantId, session.bearer),
      payload: { password: 'password123', confirm: 'NO' },
    });
    expect(badConfirm.statusCode).toBe(400);

    const deleted = await app.inject({
      method: 'POST',
      url: '/v1/me/account/delete',
      headers: authHeaders('daminatofit', session.cookie, tenantId, session.bearer),
      payload: { password: 'password123', confirm: 'ELIMINAR' },
    });
    expect(deleted.statusCode).toBe(200);

    const domain = await migrator.sql<{ deleted_at: string | null; status: string }[]>`
      SELECT deleted_at, status FROM users WHERE id = ${userId}
    `;
    expect(domain[0]?.deleted_at).toBeTruthy();
    expect(domain[0]?.status).toBe('disabled');

    const tenant = await migrator.sql<{ status: string }[]>`
      SELECT status FROM tenants WHERE id = ${tenantId}
    `;
    expect(tenant[0]?.status).toBe('archived');

    const authUser = await migrator.sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM auth_daminatofit."user" WHERE email = 'delete-me@example.com'
    `;
    expect(authUser[0]?.n).toBe(0);

    const after = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: authHeaders('daminatofit', session.cookie, undefined, session.bearer),
    });
    expect(after.statusCode).toBe(401);

    const loginAgain = await app.inject({
      method: 'POST',
      url: '/auth/daminatofit/sign-in/email',
      headers: { 'content-type': 'application/json' },
      payload: { email: 'delete-me@example.com', password: 'password123' },
    });
    expect(loginAgain.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('cannot delete another account by forging identifiers', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/trainers/register',
      headers: authHeaders('daminatofit'),
      payload: {
        name: 'Victim',
        email: 'victim@example.com',
        password: 'password123',
        businessName: 'Victim Gym',
      },
    });
    await app.inject({
      method: 'POST',
      url: '/v1/trainers/register',
      headers: authHeaders('daminatofit'),
      payload: {
        name: 'Attacker',
        email: 'attacker@example.com',
        password: 'password123',
        businessName: 'Attacker Gym',
      },
    });

    const attacker = pickSession(
      await app.inject({
        method: 'POST',
        url: '/auth/daminatofit/sign-in/email',
        headers: { 'content-type': 'application/json' },
        payload: { email: 'attacker@example.com', password: 'password123' },
      }),
    );

    const victimStillThere = await migrator.sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM auth_daminatofit."user" WHERE email = 'victim@example.com'
    `;
    expect(victimStillThere[0]?.n).toBe(1);

    // Attacker can only delete their own Better Auth identity.
    const result = await app.inject({
      method: 'POST',
      url: '/v1/me/account/delete',
      headers: authHeaders('daminatofit', attacker.cookie, undefined, attacker.bearer),
      payload: { password: 'password123', confirm: 'ELIMINAR' },
    });
    expect(result.statusCode).toBe(200);

    const victimRemains = await migrator.sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM auth_daminatofit."user" WHERE email = 'victim@example.com'
    `;
    expect(victimRemains[0]?.n).toBe(1);
  });
});
