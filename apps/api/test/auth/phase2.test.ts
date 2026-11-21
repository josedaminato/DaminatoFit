import { APP_BRAND_HEADER, TENANT_ID_HEADER } from '@daminatofit/contracts';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app';
import { loadEnv } from '../../src/config/env';
import { hashToken } from '../../src/modules/trainers/trainers.service';
import { openMigratorDb, resetDatabase } from '../db';
import { closeDb, type DbHandles } from '../../src/db/client';

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

describe('Phase 2 — auth, brands, invitations', () => {
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
  });

  afterAll(async () => {
    await app.close();
    await closeDb(migrator);
  });

  it('registers a DaminatoFit trainer and returns a session', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/trainers/register',
      headers: authHeaders('daminatofit'),
      payload: {
        name: 'Coach Ana',
        email: 'ana@example.com',
        password: 'password123',
        businessName: 'Ana Training',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.tenantId).toBeTruthy();
    expect(body.userId).toBeTruthy();
  });

  it('rejects duplicate trainer email', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/trainers/register',
      headers: authHeaders('daminatofit'),
      payload: {
        name: 'Coach Ana 2',
        email: 'ana@example.com',
        password: 'password123',
        businessName: 'Other',
      },
    });
    expect([400, 409]).toContain(response.statusCode);
  });

  it('blocks free trainer registration on PupiApp', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/trainers/register',
      headers: authHeaders('pupiapp'),
      payload: {
        name: 'Someone',
        email: 'x@example.com',
        password: 'password123',
        businessName: 'Nope',
      },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe('trainer_signup_closed');
  });

  it('bootstraps PupiApp trainer idempotently with a secret', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/v1/admin/bootstrap-pupiapp',
      payload: {
        secret: 'test_pupiapp_bootstrap_secret',
        name: 'Pupi',
        email: 'pupi@example.com',
        password: 'password123',
        businessName: 'Pupi Studio',
      },
    });
    expect([200, 201]).toContain(first.statusCode);

    const second = await app.inject({
      method: 'POST',
      url: '/v1/admin/bootstrap-pupiapp',
      payload: {
        secret: 'test_pupiapp_bootstrap_secret',
        name: 'Pupi',
        email: 'pupi2@example.com',
        password: 'password123',
      },
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().status).toBe('already_bootstrapped');
  });

  it('rejects PupiApp bootstrap with a wrong secret', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/admin/bootstrap-pupiapp',
      payload: {
        secret: 'wrong-secret-value!!',
        name: 'X',
        email: 'x@example.com',
        password: 'password123',
      },
    });
    expect(response.statusCode).toBe(403);
  });

  it('signs in, invites a student, and accepts the invitation', async () => {
    const signIn = await app.inject({
      method: 'POST',
      url: '/auth/daminatofit/sign-in/email',
      headers: { 'content-type': 'application/json', ...authHeaders('daminatofit') },
      payload: { email: 'ana@example.com', password: 'password123' },
    });
    expect(signIn.statusCode).toBeLessThan(400);
    const session = pickSession(signIn);
    expect(session.cookie || session.bearer).toBeTruthy();

    const me = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: authHeaders('daminatofit', session.cookie, undefined, session.bearer),
    });
    expect(me.statusCode).toBe(200);
    const meBody = me.json();
    const tenantId = meBody.memberships[0]?.tenantId as string;
    expect(tenantId).toBeTruthy();

    const invite = await app.inject({
      method: 'POST',
      url: '/v1/invitations',
      headers: authHeaders('daminatofit', session.cookie, tenantId, session.bearer),
      payload: { email: 'alumno@example.com' },
    });
    expect(invite.statusCode).toBe(201);
    const inviteUrl = invite.json().inviteUrl as string;
    const token = new URL(
      inviteUrl.replace('daminatofit://invite', 'http://local/invite'),
    ).searchParams.get('token');
    expect(token).toBeTruthy();

    // Token is stored hashed — raw token must not appear in DB.
    const stored = await migrator.sql<{ token_hash: string }[]>`
      SELECT token_hash FROM invitations WHERE email = 'alumno@example.com' LIMIT 1
    `;
    expect(stored[0]?.token_hash).toBe(hashToken(token!));
    expect(stored[0]?.token_hash).not.toBe(token);

    const accept = await app.inject({
      method: 'POST',
      url: '/v1/invitations/accept',
      headers: authHeaders('daminatofit'),
      payload: {
        token,
        name: 'Alumno Uno',
        password: 'password123',
      },
    });
    expect(accept.statusCode).toBe(200);
    expect(accept.json().tenantId).toBe(tenantId);

    const reused = await app.inject({
      method: 'POST',
      url: '/v1/invitations/accept',
      headers: authHeaders('daminatofit'),
      payload: { token, name: 'Alumno Uno', password: 'password123' },
    });
    expect([409, 410, 400]).toContain(reused.statusCode);
  });

  it('denies cross-brand session use on /v1/me', async () => {
    const signIn = await app.inject({
      method: 'POST',
      url: '/auth/daminatofit/sign-in/email',
      headers: { 'content-type': 'application/json' },
      payload: { email: 'ana@example.com', password: 'password123' },
    });
    const session = pickSession(signIn);

    const cross = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: authHeaders('pupiapp', session.cookie, undefined, session.bearer),
    });
    expect(cross.statusCode).toBe(401);
  });

  it('rejects wrong password', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/daminatofit/sign-in/email',
      headers: { 'content-type': 'application/json' },
      payload: { email: 'ana@example.com', password: 'wrong-password' },
    });
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('revokes an invitation before accept', async () => {
    const signIn = await app.inject({
      method: 'POST',
      url: '/auth/daminatofit/sign-in/email',
      headers: { 'content-type': 'application/json' },
      payload: { email: 'ana@example.com', password: 'password123' },
    });
    const session = pickSession(signIn);
    const me = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: authHeaders('daminatofit', session.cookie, undefined, session.bearer),
    });
    const tenantId = me.json().memberships[0].tenantId as string;

    const invite = await app.inject({
      method: 'POST',
      url: '/v1/invitations',
      headers: authHeaders('daminatofit', session.cookie, tenantId, session.bearer),
      payload: { email: 'revocado@example.com' },
    });
    const inviteId = invite.json().id as string;
    const token = new URL(
      (invite.json().inviteUrl as string).replace('daminatofit://invite', 'http://local/invite'),
    ).searchParams.get('token');

    const revoked = await app.inject({
      method: 'POST',
      url: `/v1/invitations/${inviteId}/revoke`,
      headers: authHeaders('daminatofit', session.cookie, tenantId, session.bearer),
    });
    expect(revoked.statusCode).toBe(200);

    const accept = await app.inject({
      method: 'POST',
      url: '/v1/invitations/accept',
      headers: authHeaders('daminatofit'),
      payload: { token, name: 'X', password: 'password123' },
    });
    expect([410, 400]).toContain(accept.statusCode);
  });

  it('allows the same email in both realms independently', async () => {
    const dami = await app.inject({
      method: 'POST',
      url: '/v1/trainers/register',
      headers: authHeaders('daminatofit'),
      payload: {
        name: 'Shared',
        email: 'shared@example.com',
        password: 'password123',
        businessName: 'Shared DF',
      },
    });
    expect(dami.statusCode).toBe(201);

    // Pupi already bootstrapped; sign-up in pupiapp auth schema directly via Better Auth.
    const pupiSignUp = await app.inject({
      method: 'POST',
      url: '/auth/pupiapp/sign-up/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        name: 'Shared Pupi',
        email: 'shared@example.com',
        password: 'password123',
      },
    });
    expect(pupiSignUp.statusCode).toBeLessThan(400);
  });

  it('rate-limits repeated trainer registration attempts', async () => {
    const attempts = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        app.inject({
          method: 'POST',
          url: '/v1/trainers/register',
          headers: authHeaders('daminatofit'),
          payload: {
            name: 'Flood',
            email: `flood${i}-${Date.now()}@example.com`,
            password: 'password123',
            businessName: 'Flood',
          },
        }),
      ),
    );
    expect(attempts.some((r) => r.statusCode === 429)).toBe(true);
  });
});
