import { randomUUID } from 'node:crypto';
import { APP_BRAND_HEADER, TENANT_ID_HEADER } from '@daminatofit/contracts';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app';
import { loadEnv } from '../../src/config/env';
import { closeDb, type DbHandles } from '../../src/db/client';
import { openMigratorDb, resetDatabase } from '../db';

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

async function registerTrainer(app: FastifyInstance, email: string, businessName: string) {
  const reg = await app.inject({
    method: 'POST',
    url: '/v1/trainers/register',
    headers: authHeaders('daminatofit'),
    payload: { name: businessName, email, password: 'password123', businessName },
  });
  expect(reg.statusCode).toBe(201);
  const signIn = await app.inject({
    method: 'POST',
    url: '/auth/daminatofit/sign-in/email',
    headers: { 'content-type': 'application/json' },
    payload: { email, password: 'password123' },
  });
  const session = pickSession(signIn);
  const me = await app.inject({
    method: 'GET',
    url: '/v1/me',
    headers: authHeaders('daminatofit', session.cookie, undefined, session.bearer),
  });
  return {
    session,
    tenantId: me.json().memberships[0].tenantId as string,
  };
}

async function inviteStudent(
  app: FastifyInstance,
  trainer: Awaited<ReturnType<typeof registerTrainer>>,
  email: string,
) {
  const invite = await app.inject({
    method: 'POST',
    url: '/v1/invitations',
    headers: authHeaders(
      'daminatofit',
      trainer.session.cookie,
      trainer.tenantId,
      trainer.session.bearer,
    ),
    payload: { email },
  });
  const token = new URL(
    (invite.json().inviteUrl as string).replace('daminatofit://invite', 'http://local/invite'),
  ).searchParams.get('token');
  await app.inject({
    method: 'POST',
    url: '/v1/invitations/accept',
    headers: authHeaders('daminatofit'),
    payload: { token, name: email.split('@')[0], password: 'password123' },
  });
  const signIn = await app.inject({
    method: 'POST',
    url: '/auth/daminatofit/sign-in/email',
    headers: { 'content-type': 'application/json' },
    payload: { email, password: 'password123' },
  });
  const session = pickSession(signIn);
  const me = await app.inject({
    method: 'GET',
    url: '/v1/me',
    headers: authHeaders('daminatofit', session.cookie, undefined, session.bearer),
  });
  const membership = (me.json().memberships as Array<{ tenantId: string; id: string }>).find(
    (m) => m.tenantId === trainer.tenantId,
  );
  return { session, membershipId: membership!.id, tenantId: trainer.tenantId };
}

describe('Phase 5 — workouts, sync and progress', () => {
  let app: FastifyInstance;
  let migrator: DbHandles;
  let trainerA: Awaited<ReturnType<typeof registerTrainer>>;
  let trainerB: Awaited<ReturnType<typeof registerTrainer>>;
  let student1: Awaited<ReturnType<typeof inviteStudent>>;
  let student2: Awaited<ReturnType<typeof inviteStudent>>;
  let routineVersionId: string;
  let dayId: string;
  let exerciseId: string;
  let setId: string;
  let assignedPlanId: string;

  beforeAll(async () => {
    await resetDatabase();
    migrator = await openMigratorDb();
    const env = loadEnv({
      ...process.env,
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      BETTER_AUTH_SECRET:
        process.env.BETTER_AUTH_SECRET ?? 'test_secret_daminatofit_phase5_32chars!',
      S3_ENDPOINT: process.env.S3_ENDPOINT ?? 'http://127.0.0.1:9000',
      S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID ?? 'daminatofit',
      S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY ?? 'daminatofit_dev_secret',
      S3_BUCKET: process.env.S3_BUCKET ?? 'daminatofit-media',
      S3_FORCE_PATH_STYLE: 'true',
    });
    const built = await buildApp(env);
    app = built.app;
    trainerA = await registerTrainer(app, 'coach-a-w@example.com', 'Coach A W');
    trainerB = await registerTrainer(app, 'coach-b-w@example.com', 'Coach B W');
    student1 = await inviteStudent(app, trainerA, 'student1-w@example.com');
    student2 = await inviteStudent(app, trainerA, 'student2-w@example.com');

    const globals = await app.inject({
      method: 'GET',
      url: '/v1/exercises?scope=global',
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
    });
    exerciseId = globals.json().exercises[0].id as string;

    const created = await app.inject({
      method: 'POST',
      url: '/v1/routines',
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
      payload: { name: 'Fuerza 3 días' },
    });
    const planId = created.json().id as string;
    await app.inject({
      method: 'PUT',
      url: `/v1/routines/${planId}/draft`,
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
      payload: {
        name: 'Fuerza 3 días',
        description: '',
        changeNote: '',
        days: [
          {
            name: 'Día A',
            weekIndex: 1,
            position: 0,
            notes: '',
            exercises: [
              {
                exerciseId,
                position: 0,
                notes: '',
                restSeconds: 60,
                sets: [
                  { position: 0, targetRepsMin: 10, targetRepsMax: 12, targetWeightKg: 20 },
                  { position: 1, targetRepsMin: 10, targetRepsMax: 12, targetWeightKg: 20 },
                ],
              },
            ],
          },
          {
            name: 'Día B',
            weekIndex: 1,
            position: 1,
            notes: '',
            exercises: [
              {
                exerciseId,
                position: 0,
                notes: '',
                sets: [{ position: 0, targetRepsMin: 8, targetRepsMax: 8, targetWeightKg: 30 }],
              },
            ],
          },
          {
            name: 'Día C',
            weekIndex: 1,
            position: 2,
            notes: '',
            exercises: [
              {
                exerciseId,
                position: 0,
                notes: '',
                sets: [{ position: 0, targetRepsMin: 15, targetRepsMax: 15 }],
              },
            ],
          },
        ],
      },
    });
    await app.inject({
      method: 'POST',
      url: `/v1/routines/${planId}/publish`,
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
      payload: {},
    });

    const assign = await app.inject({
      method: 'POST',
      url: `/v1/routines/${planId}/assign`,
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
      payload: {
        studentMembershipIds: [student1.membershipId, student2.membershipId],
        replaceActive: true,
      },
    });
    assignedPlanId = assign.json().assignedPlanIds[0] as string;

    const detail = await app.inject({
      method: 'GET',
      url: `/v1/student/routines/${assignedPlanId}`,
      headers: authHeaders(
        'daminatofit',
        student1.session.cookie,
        student1.tenantId,
        student1.session.bearer,
      ),
    });
    routineVersionId = detail.json().routine.version.id as string;
    dayId = detail.json().routine.days[0].id as string;
    setId = detail.json().routine.days[0].exercises[0].sets[0].id as string;
  }, 180_000);

  afterAll(async () => {
    if (app) await app.close();
    if (migrator) await closeDb(migrator);
  });

  it('starts session, logs sets, finishes and computes progress', async () => {
    const clientId = randomUUID();
    const start = await app.inject({
      method: 'POST',
      url: '/v1/workouts/sessions',
      headers: authHeaders(
        'daminatofit',
        student1.session.cookie,
        student1.tenantId,
        student1.session.bearer,
      ),
      payload: {
        clientId,
        routineVersionId,
        routineVersionDayId: dayId,
      },
    });
    expect(start.statusCode).toBe(201);
    const sessionId = start.json().session.id as string;

    // Idempotent start
    const again = await app.inject({
      method: 'POST',
      url: '/v1/workouts/sessions',
      headers: authHeaders(
        'daminatofit',
        student1.session.cookie,
        student1.tenantId,
        student1.session.bearer,
      ),
      payload: { clientId, routineVersionId, routineVersionDayId: dayId },
    });
    expect(again.json().session.id).toBe(sessionId);

    const setClientId = randomUUID();
    const upsert = await app.inject({
      method: 'PUT',
      url: `/v1/workouts/sessions/${sessionId}/sets`,
      headers: authHeaders(
        'daminatofit',
        student1.session.cookie,
        student1.tenantId,
        student1.session.bearer,
      ),
      payload: {
        sets: [
          {
            clientId: setClientId,
            exerciseId,
            routineVersionSetId: setId,
            position: 0,
            prescribedRepsMin: 10,
            prescribedRepsMax: 12,
            prescribedWeightKg: 20,
            actualReps: 12,
            actualWeightKg: 22,
            completed: true,
            clientUpdatedAt: new Date().toISOString(),
          },
        ],
      },
    });
    expect(upsert.statusCode).toBe(200);
    expect(upsert.json().results[0].applied).toBe(true);

    // Stale update rejected (LWW)
    const stale = await app.inject({
      method: 'PUT',
      url: `/v1/workouts/sessions/${sessionId}/sets`,
      headers: authHeaders(
        'daminatofit',
        student1.session.cookie,
        student1.tenantId,
        student1.session.bearer,
      ),
      payload: {
        sets: [
          {
            clientId: setClientId,
            exerciseId,
            routineVersionSetId: setId,
            position: 0,
            actualReps: 1,
            actualWeightKg: 1,
            completed: true,
            clientUpdatedAt: '2020-01-01T00:00:00.000Z',
          },
        ],
      },
    });
    expect(stale.json().results[0].applied).toBe(false);
    expect(stale.json().results[0].reason).toBe('stale');

    const finish = await app.inject({
      method: 'POST',
      url: `/v1/workouts/sessions/${sessionId}/finish`,
      headers: authHeaders(
        'daminatofit',
        student1.session.cookie,
        student1.tenantId,
        student1.session.bearer,
      ),
      payload: { status: 'completed' },
    });
    expect(finish.statusCode).toBe(200);

    const history = await app.inject({
      method: 'GET',
      url: '/v1/workouts/sessions',
      headers: authHeaders(
        'daminatofit',
        student1.session.cookie,
        student1.tenantId,
        student1.session.bearer,
      ),
    });
    expect(history.json().sessions.some((s: { id: string }) => s.id === sessionId)).toBe(true);

    const progress = await app.inject({
      method: 'GET',
      url: '/v1/student/progress',
      headers: authHeaders(
        'daminatofit',
        student1.session.cookie,
        student1.tenantId,
        student1.session.bearer,
      ),
    });
    expect(progress.json().progress.summary.completedSessions).toBeGreaterThanOrEqual(1);
    expect(progress.json().progress.summary.totalVolumeKg).toBe(12 * 22);

    const trainerView = await app.inject({
      method: 'GET',
      url: `/v1/trainer/students/${student1.membershipId}/workouts`,
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
    });
    expect(trainerView.statusCode).toBe(200);
    expect(trainerView.json().sessions.some((s: { id: string }) => s.id === sessionId)).toBe(true);

    const trainerProgress = await app.inject({
      method: 'GET',
      url: `/v1/trainer/students/${student1.membershipId}/progress`,
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
    });
    expect(trainerProgress.json().progress.summary.completedSessions).toBeGreaterThanOrEqual(1);
  });

  it('syncs offline batch idempotently and isolates students/trainers', async () => {
    const student2Plans = await app.inject({
      method: 'GET',
      url: '/v1/student/routines',
      headers: authHeaders(
        'daminatofit',
        student2.session.cookie,
        student2.tenantId,
        student2.session.bearer,
      ),
    });
    const student2PlanId = student2Plans.json().routines[0].id as string;
    const student2Detail = await app.inject({
      method: 'GET',
      url: `/v1/student/routines/${student2PlanId}`,
      headers: authHeaders(
        'daminatofit',
        student2.session.cookie,
        student2.tenantId,
        student2.session.bearer,
      ),
    });
    const s2VersionId = student2Detail.json().routine.version.id as string;
    const s2DayId = student2Detail.json().routine.days[0].id as string;
    const s2SetId = student2Detail.json().routine.days[0].exercises[0].sets[0].id as string;
    const s2ExerciseId = student2Detail.json().routine.days[0].exercises[0].exerciseId as string;

    const sessionClientId = randomUUID();
    const setClientId = randomUUID();
    const sync1 = await app.inject({
      method: 'POST',
      url: '/v1/workouts/sync',
      headers: authHeaders(
        'daminatofit',
        student2.session.cookie,
        student2.tenantId,
        student2.session.bearer,
      ),
      payload: {
        sessions: [
          {
            clientId: sessionClientId,
            routineVersionId: s2VersionId,
            routineVersionDayId: s2DayId,
            status: 'in_progress',
          },
        ],
        sets: [
          {
            sessionClientId,
            clientId: setClientId,
            exerciseId: s2ExerciseId,
            routineVersionSetId: s2SetId,
            position: 0,
            prescribedRepsMin: 10,
            prescribedRepsMax: 12,
            prescribedWeightKg: 20,
            actualReps: 10,
            actualWeightKg: 20,
            completed: true,
            clientUpdatedAt: new Date().toISOString(),
          },
        ],
      },
    });
    expect(sync1.statusCode).toBe(200);
    expect(sync1.json().sessions[0].error).toBeUndefined();
    expect(sync1.json().sessions[0].sessionId).toBeTruthy();
    expect(sync1.json().sets[0].applied).toBe(true);

    // Duplicate sync
    const sync2 = await app.inject({
      method: 'POST',
      url: '/v1/workouts/sync',
      headers: authHeaders(
        'daminatofit',
        student2.session.cookie,
        student2.tenantId,
        student2.session.bearer,
      ),
      payload: {
        sessions: [
          {
            clientId: sessionClientId,
            routineVersionId: s2VersionId,
            routineVersionDayId: s2DayId,
            status: 'completed',
            finishedAt: new Date().toISOString(),
          },
        ],
        sets: [
          {
            sessionClientId,
            clientId: setClientId,
            exerciseId: s2ExerciseId,
            routineVersionSetId: s2SetId,
            position: 0,
            actualReps: 10,
            actualWeightKg: 20,
            completed: true,
            clientUpdatedAt: new Date().toISOString(),
          },
        ],
      },
    });
    expect(sync2.json().sessions[0].sessionId).toBe(sync1.json().sessions[0].sessionId);

    // Student1 cannot read student2 session
    const stolen = await app.inject({
      method: 'GET',
      url: `/v1/workouts/sessions/${sync1.json().sessions[0].sessionId}`,
      headers: authHeaders(
        'daminatofit',
        student1.session.cookie,
        student1.tenantId,
        student1.session.bearer,
      ),
    });
    expect(stolen.statusCode).toBe(404);

    // Trainer B cannot see student1 workouts
    const bView = await app.inject({
      method: 'GET',
      url: `/v1/trainer/students/${student1.membershipId}/workouts`,
      headers: authHeaders(
        'daminatofit',
        trainerB.session.cookie,
        trainerB.tenantId,
        trainerB.session.bearer,
      ),
    });
    expect(bView.statusCode).toBe(404);

    // Student cannot start for trainer
    const trainerStart = await app.inject({
      method: 'POST',
      url: '/v1/workouts/sessions',
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
      payload: {
        clientId: randomUUID(),
        routineVersionId,
        routineVersionDayId: dayId,
      },
    });
    expect(trainerStart.statusCode).toBe(403);
  });

  it('rejects invalid set values', async () => {
    const clientId = randomUUID();
    // Need no active session - student2 finished above. student1 finished too.
    const start = await app.inject({
      method: 'POST',
      url: '/v1/workouts/sessions',
      headers: authHeaders(
        'daminatofit',
        student1.session.cookie,
        student1.tenantId,
        student1.session.bearer,
      ),
      payload: {
        clientId,
        routineVersionId,
        routineVersionDayId: dayId,
      },
    });
    // May resume same day or create - if active_session from incomplete, handle
    const sessionId =
      start.statusCode === 201
        ? (start.json().session.id as string)
        : (
            await app.inject({
              method: 'GET',
              url: '/v1/workouts/sessions/active',
              headers: authHeaders(
                'daminatofit',
                student1.session.cookie,
                student1.tenantId,
                student1.session.bearer,
              ),
            })
          ).json().active?.session?.id;

    expect(sessionId).toBeTruthy();

    const bad = await app.inject({
      method: 'PUT',
      url: `/v1/workouts/sessions/${sessionId}/sets`,
      headers: authHeaders(
        'daminatofit',
        student1.session.cookie,
        student1.tenantId,
        student1.session.bearer,
      ),
      payload: {
        sets: [
          {
            clientId: randomUUID(),
            exerciseId,
            position: 0,
            actualReps: -1,
            completed: true,
            clientUpdatedAt: new Date().toISOString(),
          },
        ],
      },
    });
    expect(bad.statusCode).toBe(400);

    await app.inject({
      method: 'POST',
      url: `/v1/workouts/sessions/${sessionId}/finish`,
      headers: authHeaders(
        'daminatofit',
        student1.session.cookie,
        student1.tenantId,
        student1.session.bearer,
      ),
      payload: { status: 'abandoned' },
    });
  });
});
