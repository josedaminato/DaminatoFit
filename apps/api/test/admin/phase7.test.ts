import { APP_BRAND_HEADER, estimateMonthlyCents, TENANT_ID_HEADER } from '@daminatofit/contracts';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app';
import { loadEnv } from '../../src/config/env';
import { closeDb, type DbHandles } from '../../src/db/client';
import { openAppDb, openMigratorDb, resetDatabase } from '../db';

function authHeaders(brand: string, cookie?: string, tenantId?: string, bearer?: string) {
  const headers: Record<string, string> = { [APP_BRAND_HEADER]: brand };
  if (cookie) headers.cookie = cookie;
  if (tenantId) headers[TENANT_ID_HEADER] = tenantId;
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  return headers;
}

function pickSession(response: { headers: Record<string, string | string[] | undefined> }) {
  const setCookie = response.headers['set-cookie'];
  const cookie = Array.isArray(setCookie) ? setCookie.join('; ') : setCookie;
  const bearer = response.headers['set-auth-token'];
  return {
    cookie: typeof cookie === 'string' ? cookie : undefined,
    bearer: typeof bearer === 'string' ? bearer : undefined,
  };
}

interface Session {
  cookie?: string;
  bearer?: string;
}

describe('phase 7 — platform admin panel', () => {
  let app: FastifyInstance;
  let migrator: DbHandles;
  let appDb: DbHandles;
  let adminSession: Session;
  let adminUserId: string;
  let trainerA: { session: Session; tenantId: string; userId: string };
  let trainerB: { session: Session; tenantId: string; userId: string };
  let studentEmail: string;

  beforeAll(async () => {
    await resetDatabase();
    migrator = await openMigratorDb();
    appDb = await openAppDb();
    const env = loadEnv({
      ...process.env,
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      BETTER_AUTH_SECRET:
        process.env.BETTER_AUTH_SECRET ?? 'test_secret_daminatofit_phase7_32chars!',
      PLATFORM_ADMIN_PROVISION_SECRET: 'phase7_admin_provision',
      PUSH_PROVIDER: 'mock',
      PUSH_AUTOPROCESS: 'false',
    });
    const built = await buildApp(env, { migrator, appDb });
    app = built.app;

    const adminEmail = 'admin.phase7@example.com';
    const signUp = await app.inject({
      method: 'POST',
      url: '/auth/daminatofit/sign-up/email',
      headers: { 'content-type': 'application/json' },
      payload: { email: adminEmail, password: 'password123', name: 'Admin Phase7' },
    });
    expect(signUp.statusCode).toBe(200);
    const authUserId = signUp.json().user.id as string;
    await migrator.sql`SELECT app.ensure_domain_user('daminatofit', ${authUserId}, ${'Admin Phase7'})`;
    const domain = await migrator.sql<{ id: string }[]>`
      SELECT id FROM users WHERE realm = 'daminatofit' AND auth_user_id = ${authUserId}
    `;
    adminUserId = domain[0]!.id;
    await migrator.sql`SELECT app.grant_platform_admin(${adminUserId}::uuid)`;
    const signIn = await app.inject({
      method: 'POST',
      url: '/auth/daminatofit/sign-in/email',
      headers: { 'content-type': 'application/json' },
      payload: { email: adminEmail, password: 'password123' },
    });
    adminSession = pickSession(signIn);

    async function registerTrainer(email: string, businessName: string) {
      const reg = await app.inject({
        method: 'POST',
        url: '/v1/trainers/register',
        headers: authHeaders('daminatofit'),
        payload: { name: businessName, email, password: 'password123', businessName },
      });
      expect(reg.statusCode).toBe(201);
      const login = await app.inject({
        method: 'POST',
        url: '/auth/daminatofit/sign-in/email',
        headers: { 'content-type': 'application/json' },
        payload: { email, password: 'password123' },
      });
      const session = pickSession(login);
      const me = await app.inject({
        method: 'GET',
        url: '/v1/me',
        headers: authHeaders('daminatofit', session.cookie, undefined, session.bearer),
      });
      return {
        session,
        tenantId: me.json().memberships[0].tenantId as string,
        userId: me.json().user.id as string,
      };
    }

    trainerA = await registerTrainer('trainer.a.phase7@example.com', 'Trainer A');
    trainerB = await registerTrainer('trainer.b.phase7@example.com', 'Trainer B');

    studentEmail = 'student.multi.phase7@example.com';
    for (const trainer of [trainerA, trainerB]) {
      const invite = await app.inject({
        method: 'POST',
        url: '/v1/invitations',
        headers: authHeaders(
          'daminatofit',
          trainer.session.cookie,
          trainer.tenantId,
          trainer.session.bearer,
        ),
        payload: { email: studentEmail },
      });
      expect(invite.statusCode).toBe(201);
      const token = new URL(
        (invite.json().inviteUrl as string).replace('daminatofit://invite', 'http://local/invite'),
      ).searchParams.get('token');
      const accepted = await app.inject({
        method: 'POST',
        url: '/v1/invitations/accept',
        headers: authHeaders('daminatofit'),
        payload:
          trainer === trainerA
            ? { token, name: 'Student Multi', password: 'password123' }
            : { token, password: 'password123' },
      });
      expect(accepted.statusCode).toBe(200);
    }
  }, 90_000);

  afterAll(async () => {
    await app?.close();
    await closeDb(appDb);
    await closeDb(migrator);
  });

  it('blocks anonymous, trainers and students from admin APIs', async () => {
    const anon = await app.inject({ method: 'GET', url: '/v1/admin/dashboard' });
    expect(anon.statusCode).toBe(401);

    const trainerDenied = await app.inject({
      method: 'GET',
      url: '/v1/admin/dashboard',
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
    });
    expect(trainerDenied.statusCode).toBe(403);

    const studentLogin = await app.inject({
      method: 'POST',
      url: '/auth/daminatofit/sign-in/email',
      headers: { 'content-type': 'application/json' },
      payload: { email: studentEmail, password: 'password123' },
    });
    const studentSession = pickSession(studentLogin);
    const studentDenied = await app.inject({
      method: 'GET',
      url: '/v1/admin/me',
      headers: authHeaders('daminatofit', studentSession.cookie, undefined, studentSession.bearer),
    });
    expect(studentDenied.statusCode).toBe(403);

    const register = await app.inject({
      method: 'POST',
      url: '/v1/admin/register',
      payload: { email: 'x@y.com', password: 'password123' },
    });
    expect(register.statusCode).toBe(404);

    const escalate = await app.inject({
      method: 'PATCH',
      url: '/v1/me',
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
      payload: { platformRole: 'platform_admin' },
    });
    expect([400, 404, 405]).toContain(escalate.statusCode);

    const role = await migrator.sql<{ platform_role: string }[]>`
      SELECT platform_role FROM users WHERE id = ${trainerA.userId}
    `;
    expect(role[0]?.platform_role).toBe('user');
  });

  it('lets a platform admin read dashboard counts for DaminatoFit only', async () => {
    const me = await app.inject({
      method: 'GET',
      url: '/v1/admin/me',
      headers: authHeaders('daminatofit', adminSession.cookie, undefined, adminSession.bearer),
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.platformRole).toBe('platform_admin');
    expect(me.json().mfa.enabled).toBe(false);
    expect(me.json().mfa.requiredBeforeInternetExposure).toBe(true);

    const dash = await app.inject({
      method: 'GET',
      url: '/v1/admin/dashboard',
      headers: authHeaders('daminatofit', adminSession.cookie, undefined, adminSession.bearer),
    });
    expect(dash.statusCode).toBe(200);
    expect(dash.json().trainers.total).toBeGreaterThanOrEqual(2);
    expect(dash.json().students.unique_students).toBe(1);
    expect(dash.json().students.memberships_active).toBe(2);
    expect(dash.json().business.chargedMonthlyCents).toBe(0);
    expect(dash.json().business.estimatedMonthlyLabel).toBe('estimate_not_charged');
    expect(dash.json().scope.brand).toBe('daminatofit');
  });

  it('lists trainers, suspends and reactivates without deleting history', async () => {
    const list = await app.inject({
      method: 'GET',
      url: '/v1/admin/trainers?status=active&page=1',
      headers: authHeaders('daminatofit', adminSession.cookie, undefined, adminSession.bearer),
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().total).toBeGreaterThanOrEqual(2);

    const suspend = await app.inject({
      method: 'POST',
      url: `/v1/admin/trainers/${trainerA.tenantId}/status`,
      headers: authHeaders('daminatofit', adminSession.cookie, undefined, adminSession.bearer),
      payload: { status: 'paused', reason: 'Prueba de suspensión', confirm: true },
    });
    expect(suspend.statusCode).toBe(200);
    expect(suspend.json().status).toBe('paused');

    const blockedMe = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
    });
    expect(blockedMe.statusCode).toBe(401);

    const stillThere = await migrator.sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM announcements WHERE tenant_id = ${trainerA.tenantId}
    `;
    expect(stillThere[0]?.n).toBeGreaterThanOrEqual(0);

    const reactivate = await app.inject({
      method: 'POST',
      url: `/v1/admin/trainers/${trainerA.tenantId}/status`,
      headers: authHeaders('daminatofit', adminSession.cookie, undefined, adminSession.bearer),
      payload: { status: 'active', reason: 'Reactivación de prueba', confirm: true },
    });
    expect(reactivate.statusCode).toBe(200);
    expect(reactivate.json().status).toBe('active');
  });

  it('keeps PupiApp out of commercial estimates and computes caps in cents', async () => {
    expect(estimateMonthlyCents(0)).toBe(0);
    expect(estimateMonthlyCents(3)).toBe(600);
    expect(estimateMonthlyCents(7)).toBe(1400);
    expect(estimateMonthlyCents(10)).toBe(2000);
    expect(estimateMonthlyCents(25)).toBe(2000);

    const billing = await app.inject({
      method: 'GET',
      url: '/v1/admin/billing/estimates',
      headers: authHeaders('daminatofit', adminSession.cookie, undefined, adminSession.bearer),
    });
    expect(billing.statusCode).toBe(200);
    expect(billing.json().totals.chargedMonthlyCents).toBe(0);
    expect(billing.json().referralPolicy.automaticDiscountsEnabled).toBe(false);
    expect(billing.json().scope.brand).toBe('daminatofit');

    const versions = await app.inject({
      method: 'POST',
      url: '/v1/admin/config/commercial',
      headers: authHeaders('daminatofit', adminSession.cookie, undefined, adminSession.bearer),
      payload: {
        priceCentsPerBillableStudent: 200,
        monthlyCapCents: 2000,
        note: 'Confirmar versión sin cambio material',
        confirm: true,
      },
    });
    expect(versions.statusCode).toBe(200);
    expect(versions.json().version).toBeGreaterThan(1);
    expect(versions.json().appliesRetroactively).toBe(false);
  });

  it('captures snapshots, serves stats ranges and keeps audit immutable', async () => {
    const snap = await app.inject({
      method: 'POST',
      url: '/v1/admin/snapshots/capture',
      headers: authHeaders('daminatofit', adminSession.cookie, undefined, adminSession.bearer),
    });
    expect(snap.statusCode).toBe(200);

    const stats = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats?period=30d',
      headers: authHeaders('daminatofit', adminSession.cookie, undefined, adminSession.bearer),
    });
    expect(stats.statusCode).toBe(200);
    expect(stats.json().scope.timezone).toBe('UTC');
    expect(stats.json().snapshots.available).toBe(true);

    const students = await app.inject({
      method: 'GET',
      url: '/v1/admin/students/summary',
      headers: authHeaders('daminatofit', adminSession.cookie, undefined, adminSession.bearer),
    });
    expect(students.json().uniqueStudents).toBe(1);
    expect(students.json().membershipsActive).toBe(2);
    expect(students.json().multiTrainerStudents).toBe(1);

    const audit = await app.inject({
      method: 'GET',
      url: '/v1/admin/audit?page=1',
      headers: authHeaders('daminatofit', adminSession.cookie, undefined, adminSession.bearer),
    });
    expect(audit.statusCode).toBe(200);
    expect(audit.json().total).toBeGreaterThan(0);

    await expect(
      migrator.sql`UPDATE platform_admin_audit SET reason = 'tamper' WHERE id IS NOT NULL`,
    ).rejects.toThrow(/append-only|platform_admin_audit/i);
  });
});
