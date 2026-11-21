import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
    payload: {
      name: businessName,
      email,
      password: 'password123',
      businessName,
    },
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

describe('Phase 3 — exercises and media', () => {
  let app: FastifyInstance;
  let migrator: DbHandles;
  let trainerA: Awaited<ReturnType<typeof registerTrainer>>;
  let trainerB: Awaited<ReturnType<typeof registerTrainer>>;
  const sampleMp4 = readFileSync(join(__dirname, '../fixtures/sample.mp4'));

  beforeAll(async () => {
    await resetDatabase();
    migrator = await openMigratorDb();
    const env = loadEnv({
      ...process.env,
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      BETTER_AUTH_SECRET:
        process.env.BETTER_AUTH_SECRET ?? 'test_secret_daminatofit_phase2_32chars!',
      S3_ENDPOINT: process.env.S3_ENDPOINT ?? 'http://127.0.0.1:9000',
      S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID ?? 'daminatofit',
      S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY ?? 'daminatofit_dev_secret',
      S3_BUCKET: process.env.S3_BUCKET ?? 'daminatofit-media',
      S3_FORCE_PATH_STYLE: 'true',
      MEDIA_MAX_BYTES: '52428800',
    });
    const built = await buildApp(env);
    app = built.app;
    trainerA = await registerTrainer(app, 'coach-a-ex@example.com', 'Coach A Ex');
    trainerB = await registerTrainer(app, 'coach-b-ex@example.com', 'Coach B Ex');
  }, 120_000);

  afterAll(async () => {
    if (app) await app.close();
    if (migrator) await closeDb(migrator);
  });

  it('lists seeded global exercises as read-only catalogue', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/exercises?scope=global',
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
    });
    expect(response.statusCode).toBe(200);
    const exercises = response.json().exercises as Array<{
      scope: string;
      revision: { name: string };
    }>;
    expect(exercises.length).toBeGreaterThanOrEqual(6);
    expect(exercises.every((e) => e.scope === 'global')).toBe(true);
  });

  it('creates, searches, customizes and archives trainer exercises', async () => {
    const muscles = await app.inject({
      method: 'GET',
      url: '/v1/muscle-groups',
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
    });
    const chest = (muscles.json().muscleGroups as Array<{ id: string; slug: string }>).find(
      (m) => m.slug === 'chest',
    );

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
        name: 'Flexión diamante',
        description: 'Variante personal',
        instructions: 'Manos juntas bajo el pecho.',
        primaryMuscleGroupId: chest?.id,
        secondaryMuscleGroupIds: [],
      },
    });
    expect(created.statusCode).toBe(201);
    const exerciseId = created.json().id as string;

    const search = await app.inject({
      method: 'GET',
      url: '/v1/exercises?scope=mine&q=diamante',
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
    });
    expect(search.json().exercises.some((e: { id: string }) => e.id === exerciseId)).toBe(true);

    const globalList = await app.inject({
      method: 'GET',
      url: '/v1/exercises?scope=global',
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
    });
    const globalId = globalList.json().exercises[0].id as string;

    const customized = await app.inject({
      method: 'POST',
      url: `/v1/exercises/${globalId}/customize`,
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
      payload: {
        instructions: 'Indicación personal del entrenador A.',
      },
    });
    expect(customized.statusCode).toBe(201);
    expect(customized.json().basedOnExerciseId).toBe(globalId);

    // Global original unchanged
    const original = await app.inject({
      method: 'GET',
      url: `/v1/exercises/${globalId}`,
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
    });
    expect(original.json().exercise.revision.instructions).not.toContain(
      'Indicación personal del entrenador A',
    );

    const archived = await app.inject({
      method: 'POST',
      url: `/v1/exercises/${exerciseId}/archive`,
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
    });
    expect(archived.statusCode).toBe(200);
  });

  it('isolates private exercises between trainers', async () => {
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
        name: 'Secreto A',
        description: '',
        instructions: 'Privado',
      },
    });
    const id = created.json().id as string;

    const bList = await app.inject({
      method: 'GET',
      url: '/v1/exercises?scope=mine',
      headers: authHeaders(
        'daminatofit',
        trainerB.session.cookie,
        trainerB.tenantId,
        trainerB.session.bearer,
      ),
    });
    expect(bList.json().exercises.some((e: { id: string }) => e.id === id)).toBe(false);

    const bGet = await app.inject({
      method: 'GET',
      url: `/v1/exercises/${id}`,
      headers: authHeaders(
        'daminatofit',
        trainerB.session.cookie,
        trainerB.tenantId,
        trainerB.session.bearer,
      ),
    });
    expect(bGet.statusCode).toBe(404);

    const bPatch = await app.inject({
      method: 'PATCH',
      url: `/v1/exercises/${id}`,
      headers: authHeaders(
        'daminatofit',
        trainerB.session.cookie,
        trainerB.tenantId,
        trainerB.session.bearer,
      ),
      payload: { name: 'Hack', description: '', instructions: '' },
    });
    expect([400, 403]).toContain(bPatch.statusCode);
  });

  it('uploads, validates, dedups and plays back a video via RustFS', async () => {
    const upload = await app.inject({
      method: 'POST',
      url: '/v1/media/uploads',
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
      payload: { contentType: 'video/mp4', declaredSizeBytes: sampleMp4.length },
    });
    expect(upload.statusCode).toBe(200);
    const { assetId, uploadUrl } = upload.json() as { assetId: string; uploadUrl: string };

    const put = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': 'video/mp4' },
      body: sampleMp4,
    });
    expect(put.ok).toBe(true);

    const confirm = await app.inject({
      method: 'POST',
      url: `/v1/media/${assetId}/confirm`,
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
    });
    expect(confirm.statusCode).toBe(200);
    expect(confirm.json().status).toBe('ready');
    const readyId = confirm.json().assetId as string;

    // Second upload of same bytes → dedup
    const upload2 = await app.inject({
      method: 'POST',
      url: '/v1/media/uploads',
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
      payload: { contentType: 'video/mp4', declaredSizeBytes: sampleMp4.length },
    });
    const assetId2 = upload2.json().assetId as string;
    await fetch(upload2.json().uploadUrl as string, {
      method: 'PUT',
      headers: { 'content-type': 'video/mp4' },
      body: sampleMp4,
    });
    const confirm2 = await app.inject({
      method: 'POST',
      url: `/v1/media/${assetId2}/confirm`,
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
    });
    expect(confirm2.json().deduplicated).toBe(true);
    expect(confirm2.json().assetId).toBe(readyId);

    const playback = await app.inject({
      method: 'GET',
      url: `/v1/media/${readyId}/playback-url`,
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
    });
    expect(playback.statusCode).toBe(200);
    expect(playback.json().autoplay).toBe(false);
    expect(playback.json().url).toMatch(/^https?:\/\//);

    // Trainer B cannot play A's private video
    const stolen = await app.inject({
      method: 'GET',
      url: `/v1/media/${readyId}/playback-url`,
      headers: authHeaders(
        'daminatofit',
        trainerB.session.cookie,
        trainerB.tenantId,
        trainerB.session.bearer,
      ),
    });
    expect(stolen.statusCode).toBe(404);

    // Attach to exercise
    const withVideo = await app.inject({
      method: 'POST',
      url: '/v1/exercises',
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
      payload: {
        name: 'Con video',
        description: '',
        instructions: 'Ver demo',
        videoMediaId: readyId,
      },
    });
    expect(withVideo.statusCode).toBe(201);

    const del = await app.inject({
      method: 'DELETE',
      url: `/v1/media/${readyId}`,
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
    });
    expect(del.statusCode).toBe(409);
    expect(del.json().error).toBe('still_referenced');
  });

  it('rejects invalid format and oversized declared uploads', async () => {
    const tooBig = await app.inject({
      method: 'POST',
      url: '/v1/media/uploads',
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
      payload: { contentType: 'video/mp4', declaredSizeBytes: 999_999_999 },
    });
    expect(tooBig.statusCode).toBe(400);

    const upload = await app.inject({
      method: 'POST',
      url: '/v1/media/uploads',
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
      payload: { contentType: 'video/mp4', declaredSizeBytes: 12 },
    });
    const assetId = upload.json().assetId as string;
    await fetch(upload.json().uploadUrl as string, {
      method: 'PUT',
      headers: { 'content-type': 'video/mp4' },
      body: Buffer.from('not-a-video'),
    });
    const confirm = await app.inject({
      method: 'POST',
      url: `/v1/media/${assetId}/confirm`,
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
    });
    expect(confirm.statusCode).toBe(400);
    expect(confirm.json().error).toBe('invalid_format');
  });

  it('rejects student creating exercises', async () => {
    // Invite + accept student under trainer A
    const invite = await app.inject({
      method: 'POST',
      url: '/v1/invitations',
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
      payload: { email: 'student-ex@example.com' },
    });
    const token = new URL(
      (invite.json().inviteUrl as string).replace('daminatofit://invite', 'http://local/invite'),
    ).searchParams.get('token');

    await app.inject({
      method: 'POST',
      url: '/v1/invitations/accept',
      headers: authHeaders('daminatofit'),
      payload: { token, name: 'Student Ex', password: 'password123' },
    });

    const studentSignIn = await app.inject({
      method: 'POST',
      url: '/auth/daminatofit/sign-in/email',
      headers: { 'content-type': 'application/json' },
      payload: { email: 'student-ex@example.com', password: 'password123' },
    });
    const studentSession = pickSession(studentSignIn);

    const create = await app.inject({
      method: 'POST',
      url: '/v1/exercises',
      headers: authHeaders(
        'daminatofit',
        studentSession.cookie,
        trainerA.tenantId,
        studentSession.bearer,
      ),
      payload: { name: 'Nope', description: '', instructions: '' },
    });
    expect(create.statusCode).toBe(403);
  });
});
