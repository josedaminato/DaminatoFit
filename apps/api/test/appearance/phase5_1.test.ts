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

async function registerTrainer(app: FastifyInstance, email: string, name: string) {
  await app.inject({
    method: 'POST',
    url: '/v1/trainers/register',
    headers: authHeaders('daminatofit'),
    payload: { name, email, password: 'password123', businessName: name },
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
  return { session, tenantId: me.json().memberships[0].tenantId as string };
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
  return { session, tenantId: trainer.tenantId };
}

/** Valid 32×32 PNGs with distinct digests (passes logo dimension checks). */
const VALID_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAL0lEQVR4nO3OIQEAAAgDMArQmwD0hRg3E/Or3rmkEhAQEBAQEBAQEBAQEBAQSAcejxigeXReDwQAAAAASUVORK5CYII=',
  'base64',
);
const VALID_PNG_B = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAL0lEQVR4nO3OIQEAAAgDMMqQjPiEgBg3E/Ornr2kEhAQEBAQEBAQEBAQEBAQSAceAvXIiAZ38xMAAAAASUVORK5CYII=',
  'base64',
);

async function uploadLogo(
  app: FastifyInstance,
  trainer: Awaited<ReturnType<typeof registerTrainer>>,
  body: Buffer = VALID_PNG,
) {
  const upload = await app.inject({
    method: 'POST',
    url: '/v1/media/uploads',
    headers: authHeaders(
      'daminatofit',
      trainer.session.cookie,
      trainer.tenantId,
      trainer.session.bearer,
    ),
    payload: {
      contentType: 'image/png',
      declaredSizeBytes: body.length,
      purpose: 'logo',
    },
  });
  expect(upload.statusCode).toBe(200);
  const { assetId, uploadUrl } = upload.json() as { assetId: string; uploadUrl: string };
  const put = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': 'image/png' },
    body,
  });
  expect(put.ok).toBe(true);
  const confirm = await app.inject({
    method: 'POST',
    url: `/v1/media/${assetId}/confirm`,
    headers: authHeaders(
      'daminatofit',
      trainer.session.cookie,
      trainer.tenantId,
      trainer.session.bearer,
    ),
  });
  return confirm;
}

describe('Phase 5.1 — trainer appearance', () => {
  let app: FastifyInstance;
  let migrator: DbHandles;
  let trainerA: Awaited<ReturnType<typeof registerTrainer>>;
  let trainerB: Awaited<ReturnType<typeof registerTrainer>>;
  let student: Awaited<ReturnType<typeof inviteStudent>>;

  beforeAll(async () => {
    await resetDatabase();
    migrator = await openMigratorDb();
    const env = loadEnv({
      ...process.env,
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      BETTER_AUTH_SECRET:
        process.env.BETTER_AUTH_SECRET ?? 'test_secret_daminatofit_phase51_32chars!',
      S3_ENDPOINT: process.env.S3_ENDPOINT ?? 'http://127.0.0.1:9000',
      S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID ?? 'daminatofit',
      S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY ?? 'daminatofit_dev_secret',
      S3_BUCKET: process.env.S3_BUCKET ?? 'daminatofit-media',
      S3_FORCE_PATH_STYLE: 'true',
    });
    const built = await buildApp(env);
    app = built.app;
    trainerA = await registerTrainer(app, 'coach-a-app@example.com', 'Coach A App');
    trainerB = await registerTrainer(app, 'coach-b-app@example.com', 'Coach B App');
    student = await inviteStudent(app, trainerA, 'student-app@example.com');
  }, 120_000);

  afterAll(async () => {
    if (app) await app.close();
    if (migrator) await closeDb(migrator);
  });

  it('saves style/color/font, rejects invalid options, resets defaults', async () => {
    const save = await app.inject({
      method: 'PUT',
      url: '/v1/me/appearance',
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
      payload: { styleId: 'sport', colorId: 'blue', fontId: 'sport', logoMediaId: null },
    });
    expect(save.statusCode).toBe(200);
    expect(save.json().appearance.styleId).toBe('sport');
    expect(save.json().appearance.colorId).toBe('blue');
    expect(save.json().appearance.fontId).toBe('sport');

    const get = await app.inject({
      method: 'GET',
      url: '/v1/me/appearance',
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
    });
    expect(get.json().appearance.styleId).toBe('sport');
    expect(get.json().tokens.colors.primary).toBe('#2563EB');
    expect(get.json().tokens.layout.progressHeight).toBeGreaterThan(6);
    expect(get.json().editable).toBe(true);

    const bad = await app.inject({
      method: 'PUT',
      url: '/v1/me/appearance',
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
      payload: { styleId: 'neon', colorId: 'blue', fontId: 'modern' },
    });
    expect(bad.statusCode).toBe(400);

    const bGet = await app.inject({
      method: 'GET',
      url: '/v1/me/appearance',
      headers: authHeaders(
        'daminatofit',
        trainerB.session.cookie,
        trainerB.tenantId,
        trainerB.session.bearer,
      ),
    });
    expect(bGet.json().appearance.styleId).not.toBe('sport');

    const reset = await app.inject({
      method: 'POST',
      url: '/v1/me/appearance/reset',
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
    });
    expect(reset.json().appearance.styleId).toBe('minimal');
    expect(reset.json().appearance.colorId).toBe('turquoise');
  });

  it('student can read appearance but cannot modify it', async () => {
    await app.inject({
      method: 'PUT',
      url: '/v1/me/appearance',
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
      payload: { styleId: 'wellness', colorId: 'green', fontId: 'elegant' },
    });

    const get = await app.inject({
      method: 'GET',
      url: '/v1/me/appearance',
      headers: authHeaders(
        'daminatofit',
        student.session.cookie,
        student.tenantId,
        student.session.bearer,
      ),
    });
    expect(get.statusCode).toBe(200);
    expect(get.json().appearance.styleId).toBe('wellness');
    expect(get.json().appearance.colorId).toBe('green');
    expect(get.json().editable).toBe(false);
    expect(get.json().tokens.colors.primary).toBe('#15803D');

    const put = await app.inject({
      method: 'PUT',
      url: '/v1/me/appearance',
      headers: authHeaders(
        'daminatofit',
        student.session.cookie,
        student.tenantId,
        student.session.bearer,
      ),
      payload: { styleId: 'dynamic', colorId: 'red', fontId: 'modern' },
    });
    expect(put.statusCode).toBe(403);

    const reset = await app.inject({
      method: 'POST',
      url: '/v1/me/appearance/reset',
      headers: authHeaders(
        'daminatofit',
        student.session.cookie,
        student.tenantId,
        student.session.bearer,
      ),
    });
    expect(reset.statusCode).toBe(403);
  });

  it('trainer A cannot attach trainer B logo or mutate B appearance via own session', async () => {
    const confirmB = await uploadLogo(app, trainerB);
    expect(confirmB.statusCode).toBe(200);
    const logoB = confirmB.json().assetId as string;

    const steal = await app.inject({
      method: 'PUT',
      url: '/v1/me/appearance',
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
      payload: {
        styleId: 'dynamic',
        colorId: 'violet',
        fontId: 'compact',
        logoMediaId: logoB,
      },
    });
    expect(steal.statusCode).toBe(400);
    expect(steal.json().error).toBe('invalid_logo');

    const crossTenant = await app.inject({
      method: 'PUT',
      url: '/v1/me/appearance',
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerB.tenantId,
        trainerA.session.bearer,
      ),
      payload: { styleId: 'sport', colorId: 'red', fontId: 'sport' },
    });
    // Membership resolution must stay on trainer A's tenant
    if (crossTenant.statusCode === 200) {
      const bGet = await app.inject({
        method: 'GET',
        url: '/v1/me/appearance',
        headers: authHeaders(
          'daminatofit',
          trainerB.session.cookie,
          trainerB.tenantId,
          trainerB.session.bearer,
        ),
      });
      expect(bGet.json().appearance.styleId).not.toBe('sport');
      expect(bGet.json().appearance.colorId).not.toBe('red');
    } else {
      expect([403, 400, 401]).toContain(crossTenant.statusCode);
    }
  });

  it('uploads a valid logo, replaces it (orphans previous), rejects invalid files', async () => {
    const first = await uploadLogo(app, trainerA);
    expect(first.statusCode).toBe(200);
    expect(first.json().status).toBe('ready');
    const firstId = first.json().assetId as string;

    const save = await app.inject({
      method: 'PUT',
      url: '/v1/me/appearance',
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
      payload: {
        styleId: 'dynamic',
        colorId: 'violet',
        fontId: 'elegant',
        logoMediaId: firstId,
      },
    });
    expect(save.statusCode).toBe(200);

    const delWhileUsed = await app.inject({
      method: 'DELETE',
      url: `/v1/media/${firstId}`,
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
    });
    expect(delWhileUsed.statusCode).toBe(409);

    const second = await uploadLogo(app, trainerA, VALID_PNG_B);
    expect(second.statusCode).toBe(200);
    const secondId = second.json().assetId as string;
    expect(secondId).not.toBe(firstId);

    const replace = await app.inject({
      method: 'PUT',
      url: '/v1/me/appearance',
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
      payload: {
        styleId: 'minimal',
        colorId: 'turquoise',
        fontId: 'modern',
        logoMediaId: secondId,
      },
    });
    expect(replace.statusCode).toBe(200);

    const firstStatus = await migrator.sql<{ status: string }[]>`
      SELECT status FROM media_assets WHERE id = ${firstId}
    `;
    expect(firstStatus[0]?.status).toBe('orphaned');

    const remove = await app.inject({
      method: 'PUT',
      url: '/v1/me/appearance',
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
      payload: {
        styleId: 'minimal',
        colorId: 'turquoise',
        fontId: 'modern',
        logoMediaId: null,
      },
    });
    expect(remove.statusCode).toBe(200);
    expect(remove.json().appearance.logoMediaId).toBeNull();

    const invalid = await app.inject({
      method: 'POST',
      url: '/v1/media/uploads',
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
      payload: {
        contentType: 'image/png',
        declaredSizeBytes: 12,
        purpose: 'logo',
      },
    });
    const badId = invalid.json().assetId as string;
    await fetch(invalid.json().uploadUrl as string, {
      method: 'PUT',
      headers: { 'content-type': 'image/png' },
      body: Buffer.from('not-an-image'),
    });
    const badConfirm = await app.inject({
      method: 'POST',
      url: `/v1/media/${badId}/confirm`,
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
    });
    expect(badConfirm.statusCode).toBe(400);
    expect(badConfirm.json().error).toBe('invalid_format');
  });

  it('exposes the public appearance catalog', async () => {
    const catalog = await app.inject({
      method: 'GET',
      url: '/v1/appearance/catalog',
      headers: authHeaders('daminatofit'),
    });
    expect(catalog.statusCode).toBe(200);
    expect(catalog.json().styles).toHaveLength(5);
    expect(catalog.json().colors).toHaveLength(10);
    expect(catalog.json().fonts).toHaveLength(5);
  });
});
