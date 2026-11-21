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
  const tenantId = me.json().memberships[0].tenantId as string;
  return { session, tenantId, userId: me.json().user.id as string };
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

describe('Phase 4 — routines templates, versions and assignments', () => {
  let app: FastifyInstance;
  let migrator: DbHandles;
  let trainerA: Awaited<ReturnType<typeof registerTrainer>>;
  let trainerB: Awaited<ReturnType<typeof registerTrainer>>;
  let student1: Awaited<ReturnType<typeof inviteStudent>>;
  let student2: Awaited<ReturnType<typeof inviteStudent>>;
  let globalExerciseId: string;
  let ownExerciseId: string;

  beforeAll(async () => {
    await resetDatabase();
    migrator = await openMigratorDb();
    const env = loadEnv({
      ...process.env,
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      BETTER_AUTH_SECRET:
        process.env.BETTER_AUTH_SECRET ?? 'test_secret_daminatofit_phase4_32chars!',
      S3_ENDPOINT: process.env.S3_ENDPOINT ?? 'http://127.0.0.1:9000',
      S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID ?? 'daminatofit',
      S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY ?? 'daminatofit_dev_secret',
      S3_BUCKET: process.env.S3_BUCKET ?? 'daminatofit-media',
      S3_FORCE_PATH_STYLE: 'true',
    });
    const built = await buildApp(env);
    app = built.app;
    trainerA = await registerTrainer(app, 'coach-a-rt@example.com', 'Coach A Rt');
    trainerB = await registerTrainer(app, 'coach-b-rt@example.com', 'Coach B Rt');
    student1 = await inviteStudent(app, trainerA, 'student1-rt@example.com');
    student2 = await inviteStudent(app, trainerA, 'student2-rt@example.com');

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
    globalExerciseId = globals.json().exercises[0].id as string;

    const created = await app.inject({
      method: 'POST',
      url: '/v1/exercises',
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
      payload: {
        name: 'Press propio',
        description: '',
        instructions: 'Propio del entrenador A',
      },
    });
    ownExerciseId = created.json().id as string;
  }, 180_000);

  afterAll(async () => {
    if (app) await app.close();
    if (migrator) await closeDb(migrator);
  });

  it('creates, saves draft, publishes and versions a three-day template', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/v1/routines',
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
      payload: { name: 'Adaptación 3 días', description: 'Plantilla base' },
    });
    expect(created.statusCode).toBe(201);
    const planId = created.json().id as string;

    const draft = await app.inject({
      method: 'PUT',
      url: `/v1/routines/${planId}/draft`,
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
      payload: {
        name: 'Adaptación 3 días',
        description: 'Plantilla base',
        changeNote: 'Borrador inicial',
        days: [
          {
            name: 'Día A — tren superior',
            weekIndex: 1,
            position: 0,
            notes: '',
            exercises: [
              {
                exerciseId: globalExerciseId,
                position: 0,
                notes: '',
                restSeconds: 90,
                sets: [
                  { position: 0, targetRepsMin: 8, targetRepsMax: 10, targetWeightKg: 20 },
                  { position: 1, targetRepsMin: 8, targetRepsMax: 10, targetWeightKg: 20 },
                ],
              },
            ],
          },
          {
            name: 'Día B — tren inferior',
            weekIndex: 1,
            position: 1,
            notes: '',
            exercises: [
              {
                exerciseId: ownExerciseId,
                position: 0,
                notes: 'Controlar rodillas',
                sets: [{ position: 0, targetRepsMin: 10, targetRepsMax: 12, targetWeightKg: null }],
              },
            ],
          },
          {
            name: 'Día C — cuerpo completo',
            weekIndex: 1,
            position: 2,
            notes: '',
            exercises: [
              {
                exerciseId: globalExerciseId,
                position: 0,
                notes: '',
                sets: [{ position: 0, targetRepsMin: 12, targetRepsMax: 15 }],
              },
            ],
          },
        ],
      },
    });
    expect(draft.statusCode).toBe(200);

    const publish = await app.inject({
      method: 'POST',
      url: `/v1/routines/${planId}/publish`,
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
      payload: { changeNote: 'v1 publicada' },
    });
    expect(publish.statusCode).toBe(200);

    const detail = await app.inject({
      method: 'GET',
      url: `/v1/routines/${planId}`,
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
    });
    expect(detail.json().routine.days).toHaveLength(3);
    expect(detail.json().routine.currentVersionId).toBeTruthy();

    // New draft from published, edit weight for personalization path later
    const newDraft = await app.inject({
      method: 'POST',
      url: `/v1/routines/${planId}/new-draft`,
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
    });
    expect(newDraft.statusCode).toBe(200);

    const days = detail.json().routine.days;
    const v2Draft = await app.inject({
      method: 'PUT',
      url: `/v1/routines/${planId}/draft`,
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
      payload: {
        name: 'Adaptación 3 días',
        description: 'Plantilla base',
        changeNote: 'Más intensidad',
        days: days.map(
          (d: {
            name: string;
            weekIndex: number;
            position: number;
            notes: string;
            exercises: Array<{
              exerciseId: string;
              position: number;
              notes: string;
              restSeconds: number | null;
              sets: Array<{
                position: number;
                targetRepsMin: number;
                targetRepsMax: number;
                targetWeightKg: number | null;
                restSeconds: number | null;
              }>;
            }>;
          }) => ({
            name: d.name,
            weekIndex: d.weekIndex,
            position: d.position,
            notes: d.notes,
            exercises: d.exercises.map((e) => ({
              exerciseId: e.exerciseId,
              position: e.position,
              notes: e.notes,
              restSeconds: e.restSeconds,
              sets: e.sets.map((s) => ({
                position: s.position,
                targetRepsMin: s.targetRepsMin,
                targetRepsMax: s.targetRepsMax,
                targetWeightKg: s.targetWeightKg === null ? 25 : (s.targetWeightKg ?? 0) + 5,
                restSeconds: s.restSeconds,
              })),
            })),
          }),
        ),
      },
    });
    expect(v2Draft.statusCode).toBe(200);

    const publish2 = await app.inject({
      method: 'POST',
      url: `/v1/routines/${planId}/publish`,
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
      payload: { changeNote: 'v2' },
    });
    expect(publish2.statusCode).toBe(200);

    const after = await app.inject({
      method: 'GET',
      url: `/v1/routines/${planId}`,
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
    });
    const versions = after.json().routine.versions as Array<{
      id: string;
      status: string;
      versionNumber: number;
    }>;
    expect(versions.some((v) => v.status === 'superseded')).toBe(true);
    expect(versions.some((v) => v.status === 'published' && v.versionNumber === 2)).toBe(true);

    const supersededId = versions.find((v) => v.status === 'superseded')!.id;
    await expect(
      migrator.sql`
        UPDATE routine_versions SET change_note = 'hack' WHERE id = ${supersededId}
      `,
    ).rejects.toThrow(/immutable/i);
  });

  it('assigns to two students and personalizes only one', async () => {
    const list = await app.inject({
      method: 'GET',
      url: '/v1/routines?kind=template',
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
    });
    const planId = list.json().routines[0].id as string;

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
        startsOn: '2026-11-21',
        replaceActive: true,
      },
    });
    expect(assign.statusCode).toBe(201);
    const assignedIds = assign.json().assignedPlanIds as string[];
    expect(assignedIds).toHaveLength(2);

    const planStudent1 = assignedIds[0];
    const detail1 = await app.inject({
      method: 'GET',
      url: `/v1/routines/${planStudent1}`,
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
    });
    const days = detail1.json().routine.days;
    const firstSet = days[0].exercises[0].sets[0];

    await app.inject({
      method: 'POST',
      url: `/v1/routines/${planStudent1}/new-draft`,
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
    });

    await app.inject({
      method: 'PUT',
      url: `/v1/routines/${planStudent1}/draft`,
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
      payload: {
        name: detail1.json().routine.name,
        description: detail1.json().routine.description,
        changeNote: 'Personalización María',
        days: days.map(
          (d: {
            name: string;
            weekIndex: number;
            position: number;
            notes: string;
            exercises: Array<{
              exerciseId: string;
              position: number;
              notes: string;
              restSeconds: number | null;
              sets: Array<{
                position: number;
                targetRepsMin: number;
                targetRepsMax: number;
                targetWeightKg: number | null;
                restSeconds: number | null;
              }>;
            }>;
          }) => ({
            name: d.name,
            weekIndex: d.weekIndex,
            position: d.position,
            notes: d.notes,
            exercises: d.exercises.map((e) => ({
              exerciseId: e.exerciseId,
              position: e.position,
              notes: e.notes,
              restSeconds: e.restSeconds,
              sets: e.sets.map((s) => ({
                ...s,
                targetWeightKg: 40,
              })),
            })),
          }),
        ),
      },
    });

    await app.inject({
      method: 'POST',
      url: `/v1/routines/${planStudent1}/publish`,
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
      payload: { changeNote: 'Personalizado' },
    });

    const s1View = await app.inject({
      method: 'GET',
      url: `/v1/student/routines/${planStudent1}`,
      headers: authHeaders(
        'daminatofit',
        student1.session.cookie,
        student1.tenantId,
        student1.session.bearer,
      ),
    });
    expect(s1View.statusCode).toBe(200);
    expect(s1View.json().routine.days[0].exercises[0].sets[0].targetWeightKg).toBe(40);

    const s2List = await app.inject({
      method: 'GET',
      url: '/v1/student/routines',
      headers: authHeaders(
        'daminatofit',
        student2.session.cookie,
        student2.tenantId,
        student2.session.bearer,
      ),
    });
    const s2PlanId = s2List.json().routines[0].id as string;
    const s2View = await app.inject({
      method: 'GET',
      url: `/v1/student/routines/${s2PlanId}`,
      headers: authHeaders(
        'daminatofit',
        student2.session.cookie,
        student2.tenantId,
        student2.session.bearer,
      ),
    });
    expect(s2View.json().routine.days[0].exercises[0].sets[0].targetWeightKg).toBe(
      firstSet.targetWeightKg,
    );
    expect(s2View.json().routine.days[0].exercises[0].sets[0].targetWeightKg).not.toBe(40);

    // Student cannot create routines
    const studentCreate = await app.inject({
      method: 'POST',
      url: '/v1/routines',
      headers: authHeaders(
        'daminatofit',
        student1.session.cookie,
        student1.tenantId,
        student1.session.bearer,
      ),
      payload: { name: 'Hack' },
    });
    expect(studentCreate.statusCode).toBe(403);

    // Student A cannot read student B plan
    const stolen = await app.inject({
      method: 'GET',
      url: `/v1/student/routines/${s2PlanId}`,
      headers: authHeaders(
        'daminatofit',
        student1.session.cookie,
        student1.tenantId,
        student1.session.bearer,
      ),
    });
    expect(stolen.statusCode).toBe(404);

    // Trainer B cannot see trainer A templates
    const bList = await app.inject({
      method: 'GET',
      url: '/v1/routines?kind=template',
      headers: authHeaders(
        'daminatofit',
        trainerB.session.cookie,
        trainerB.tenantId,
        trainerB.session.bearer,
      ),
    });
    expect(bList.json().routines.some((r: { id: string }) => r.id === planId)).toBe(false);

    const bGet = await app.inject({
      method: 'GET',
      url: `/v1/routines/${planId}`,
      headers: authHeaders(
        'daminatofit',
        trainerB.session.cookie,
        trainerB.tenantId,
        trainerB.session.bearer,
      ),
    });
    expect(bGet.statusCode).toBe(404);
  });

  it('rejects invalid set ranges', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/v1/routines',
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
      payload: { name: 'Invalid sets' },
    });
    const planId = created.json().id as string;
    const bad = await app.inject({
      method: 'PUT',
      url: `/v1/routines/${planId}/draft`,
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
      payload: {
        name: 'Invalid sets',
        description: '',
        changeNote: '',
        days: [
          {
            name: 'Día 1',
            weekIndex: 1,
            position: 0,
            notes: '',
            exercises: [
              {
                exerciseId: globalExerciseId,
                position: 0,
                notes: '',
                sets: [{ position: 0, targetRepsMin: 12, targetRepsMax: 8 }],
              },
            ],
          },
        ],
      },
    });
    expect(bad.statusCode).toBe(400);
  });
});
