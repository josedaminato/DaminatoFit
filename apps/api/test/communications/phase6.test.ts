import { randomUUID } from 'node:crypto';
import { APP_BRAND_HEADER, PUSH_COPY, TENANT_ID_HEADER } from '@daminatofit/contracts';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app';
import { loadEnv } from '../../src/config/env';
import { closeDb, type DbHandles } from '../../src/db/client';
import { withTenantContext } from '../../src/db/tenant-tx';
import { processNotificationQueue } from '../../src/modules/notifications/queue';
import { MockPushAdapter } from '../../src/modules/notifications/push-adapter';
import { openMigratorDb, resetDatabase } from '../db';

const TOKEN_A = 'ExponentPushToken[phase6studentaaaaaa]';
const TOKEN_B = 'ExponentPushToken[phase6studentbbbbbb]';

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

interface Trainer {
  session: Session;
  tenantId: string;
  userId: string;
}

interface Student {
  session: Session;
  membershipId: string;
  tenantId: string;
  userId: string;
  email: string;
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
    userId: me.json().user.id as string,
  } satisfies Trainer;
}

async function inviteStudent(app: FastifyInstance, trainer: Trainer, email: string) {
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
  expect(invite.statusCode).toBe(201);
  const token = new URL(
    (invite.json().inviteUrl as string).replace('daminatofit://invite', 'http://local/invite'),
  ).searchParams.get('token');
  expect(token).toBeTruthy();
  const accepted = await app.inject({
    method: 'POST',
    url: '/v1/invitations/accept',
    headers: authHeaders('daminatofit'),
    payload: { token, name: email.split('@')[0], password: 'password123' },
  });
  expect(accepted.statusCode).toBe(200);
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
    (item) => item.tenantId === trainer.tenantId,
  );
  return {
    session,
    membershipId: membership!.id,
    tenantId: trainer.tenantId,
    userId: me.json().user.id as string,
    email,
  } satisfies Student;
}

function trainerHeaders(trainer: Trainer) {
  return authHeaders(
    'daminatofit',
    trainer.session.cookie,
    trainer.tenantId,
    trainer.session.bearer,
  );
}

function studentHeaders(student: Student, tenantId = student.tenantId) {
  return authHeaders('daminatofit', student.session.cookie, tenantId, student.session.bearer);
}

describe('Phase 6 — announcements, messages and push queue', () => {
  let app: FastifyInstance;
  let migrator: DbHandles;
  let appSql: DbHandles['sql'];
  let push: MockPushAdapter;
  let trainerA: Trainer;
  let trainerB: Trainer;
  let student1: Student;
  let student2: Student;

  beforeAll(async () => {
    await resetDatabase();
    migrator = await openMigratorDb();
    push = new MockPushAdapter();
    const env = loadEnv({
      ...process.env,
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      BETTER_AUTH_SECRET:
        process.env.BETTER_AUTH_SECRET ?? 'test_secret_daminatofit_phase6_32chars!',
      S3_ENDPOINT: process.env.S3_ENDPOINT ?? 'http://127.0.0.1:9000',
      S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID ?? 'daminatofit',
      S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY ?? 'daminatofit_dev_secret',
      S3_BUCKET: process.env.S3_BUCKET ?? 'daminatofit-media',
      S3_FORCE_PATH_STYLE: 'true',
      PUSH_PROVIDER: 'mock',
      PUSH_AUTOPROCESS: 'false',
      ANNOUNCEMENTS_PER_DAY: '6',
      DIRECT_MESSAGES_PER_RECIPIENT_PER_DAY: '4',
      DIRECT_MESSAGES_PER_HOUR: '30',
    });
    const built = await buildApp(env, undefined, { pushAdapter: push, autoProcessPush: false });
    app = built.app;
    appSql = built.resources.appDb.sql;
    trainerA = await registerTrainer(app, 'coach-a-c@example.com', 'Coach A C');
    trainerB = await registerTrainer(app, 'coach-b-c@example.com', 'Coach B C');
    student1 = await inviteStudent(app, trainerA, 'student1-c@example.com');
    student2 = await inviteStudent(app, trainerA, 'student2-c@example.com');

    for (const [trainer, whatsapp] of [
      [trainerA, '+5491111111111'],
      [trainerB, '+5492222222222'],
    ] as const) {
      const saved = await app.inject({
        method: 'PATCH',
        url: '/v1/me/trainer-profile',
        headers: trainerHeaders(trainer),
        payload: { whatsappE164: whatsapp },
      });
      expect(saved.statusCode).toBe(200);
    }
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await closeDb(migrator);
  });

  async function createDraft(trainer: Trainer, title: string, body: string) {
    return app.inject({
      method: 'POST',
      url: '/v1/communications/announcements',
      headers: trainerHeaders(trainer),
      payload: { title, body },
    });
  }

  it('publishes a general notice only inside the trainer tenant', async () => {
    const draft = await createDraft(trainerA, 'Cierre', 'Borrador inicial');
    expect(draft.statusCode).toBe(201);
    const id = draft.json().id as string;

    const hidden = await app.inject({
      method: 'GET',
      url: '/v1/communications/announcements',
      headers: studentHeaders(student1),
    });
    expect(hidden.json().announcements.map((item: { id: string }) => item.id)).not.toContain(id);

    const edited = await app.inject({
      method: 'PATCH',
      url: `/v1/communications/announcements/${id}`,
      headers: trainerHeaders(trainerA),
      payload: { title: 'Cierre del lunes', body: 'El gimnasio permanece cerrado el lunes.' },
    });
    expect(edited.statusCode).toBe(200);

    const published = await app.inject({
      method: 'POST',
      url: `/v1/communications/announcements/${id}/publish`,
      headers: trainerHeaders(trainerA),
    });
    expect(published.statusCode).toBe(200);

    const locked = await app.inject({
      method: 'PATCH',
      url: `/v1/communications/announcements/${id}`,
      headers: trainerHeaders(trainerA),
      payload: { title: 'Cambiado', body: 'No debería guardarse.' },
    });
    expect(locked.statusCode).toBe(409);

    for (const student of [student1, student2]) {
      const list = await app.inject({
        method: 'GET',
        url: '/v1/communications/announcements',
        headers: studentHeaders(student),
      });
      expect(list.statusCode).toBe(200);
      const notice = list.json().announcements.find((item: { id: string }) => item.id === id);
      expect(notice.title).toBe('Cierre del lunes');
      expect(notice.authorName).toBeTruthy();
      expect(notice.tenantId).toBe(trainerA.tenantId);
      expect(notice.publishedAt).toBeTruthy();
      expect(notice.readAt).toBeNull();
    }

    const late = await inviteStudent(app, trainerA, 'student-late-c@example.com');
    const lateList = await app.inject({
      method: 'GET',
      url: '/v1/communications/announcements',
      headers: studentHeaders(late),
    });
    expect(lateList.json().announcements.some((item: { id: string }) => item.id === id)).toBe(true);

    const outsider = await app.inject({
      method: 'GET',
      url: `/v1/communications/announcements/${id}`,
      headers: trainerHeaders(trainerB),
    });
    expect(outsider.statusCode).toBe(404);

    const asStudent = await app.inject({
      method: 'POST',
      url: '/v1/communications/announcements',
      headers: studentHeaders(student1),
      payload: { title: 'Intento', body: 'No puedo publicar.' },
    });
    expect(asStudent.statusCode).toBe(403);
  });

  it('archives a notice so students stop seeing it and the trainer keeps history', async () => {
    const draft = await createDraft(trainerA, 'Horarios', 'Horarios de diciembre.');
    const id = draft.json().id as string;
    await app.inject({
      method: 'POST',
      url: `/v1/communications/announcements/${id}/publish`,
      headers: trainerHeaders(trainerA),
    });
    const archived = await app.inject({
      method: 'POST',
      url: `/v1/communications/announcements/${id}/archive`,
      headers: trainerHeaders(trainerA),
    });
    expect(archived.statusCode).toBe(200);

    const studentList = await app.inject({
      method: 'GET',
      url: '/v1/communications/announcements',
      headers: studentHeaders(student1),
    });
    expect(studentList.json().announcements.some((item: { id: string }) => item.id === id)).toBe(
      false,
    );

    const trainerList = await app.inject({
      method: 'GET',
      url: '/v1/communications/announcements',
      headers: trainerHeaders(trainerA),
    });
    const row = trainerList.json().announcements.find((item: { id: string }) => item.id === id);
    expect(row.status).toBe('archived');
    expect(row.archivedAt).toBeTruthy();
  });

  it('delivers a private message only to the recipient and marks it read once', async () => {
    const secret = 'Revisé tus entrenamientos y vamos a ajustar la próxima rutina.';
    const sent = await app.inject({
      method: 'POST',
      url: '/v1/communications/messages',
      headers: trainerHeaders(trainerA),
      payload: { membershipId: student1.membershipId, body: secret },
    });
    expect(sent.statusCode).toBe(201);
    const id = sent.json().id as string;

    const inbox = await app.inject({
      method: 'GET',
      url: '/v1/communications/messages',
      headers: studentHeaders(student1),
    });
    expect(
      inbox
        .json()
        .messages.some(
          (item: { id: string; body: string }) => item.id === id && item.body === secret,
        ),
    ).toBe(true);

    const other = await app.inject({
      method: 'GET',
      url: `/v1/communications/messages/${id}`,
      headers: studentHeaders(student2),
    });
    expect(other.statusCode).toBe(404);

    const foreign = await app.inject({
      method: 'POST',
      url: '/v1/communications/messages',
      headers: trainerHeaders(trainerA),
      payload: { membershipId: randomUUID(), body: 'No deberías llegar.' },
    });
    expect(foreign.statusCode).toBe(404);

    const reply = await app.inject({
      method: 'POST',
      url: `/v1/communications/messages/${id}/reply`,
      headers: studentHeaders(student1),
      payload: { body: 'respuesta' },
    });
    expect(reply.statusCode).toBe(404);

    const studentSend = await app.inject({
      method: 'POST',
      url: '/v1/communications/messages',
      headers: studentHeaders(student1),
      payload: { membershipId: student2.membershipId, body: 'hola profe' },
    });
    expect(studentSend.statusCode).toBe(403);

    const before = await app.inject({
      method: 'GET',
      url: '/v1/communications/unread',
      headers: studentHeaders(student1),
    });
    expect(before.json().messages).toBeGreaterThan(0);

    const first = await app.inject({
      method: 'POST',
      url: `/v1/communications/messages/${id}/read`,
      headers: studentHeaders(student1),
    });
    const second = await app.inject({
      method: 'POST',
      url: `/v1/communications/messages/${id}/read`,
      headers: studentHeaders(student1),
    });
    expect(first.statusCode).toBe(200);
    expect(second.json().readAt).toBe(first.json().readAt);

    const after = await app.inject({
      method: 'GET',
      url: '/v1/communications/unread',
      headers: studentHeaders(student1),
    });
    expect(after.json().messages).toBe(before.json().messages - 1);

    await expect(
      withTenantContext(
        appSql,
        {
          realm: 'daminatofit',
          userId: student1.userId,
          tenantId: student1.tenantId,
          membershipId: student1.membershipId,
          role: 'student',
        },
        async (tx) => {
          await tx`UPDATE direct_messages SET body = 'hack' WHERE id = ${id}`;
        },
      ),
    ).rejects.toThrow();
  });

  it('switches the active trainer without mixing notices or WhatsApp numbers', async () => {
    const fromB = await createDraft(trainerB, 'Aviso de B', 'Solo el espacio B.');
    const idB = fromB.json().id as string;
    const published = await app.inject({
      method: 'POST',
      url: `/v1/communications/announcements/${idB}/publish`,
      headers: trainerHeaders(trainerB),
    });
    expect(published.statusCode).toBe(200);

    const invite = await app.inject({
      method: 'POST',
      url: '/v1/invitations',
      headers: trainerHeaders(trainerB),
      payload: { email: student1.email },
    });
    const token = new URL(
      (invite.json().inviteUrl as string).replace('daminatofit://invite', 'http://local/invite'),
    ).searchParams.get('token');
    const accepted = await app.inject({
      method: 'POST',
      url: '/v1/invitations/accept',
      headers: studentHeaders(student1),
      payload: { token },
    });
    expect(accepted.statusCode).toBe(200);

    const inA = await app.inject({
      method: 'GET',
      url: '/v1/communications/announcements',
      headers: studentHeaders(student1, trainerA.tenantId),
    });
    const inB = await app.inject({
      method: 'GET',
      url: '/v1/communications/announcements',
      headers: studentHeaders(student1, trainerB.tenantId),
    });
    expect(
      inA
        .json()
        .announcements.every((item: { tenantId: string }) => item.tenantId === trainerA.tenantId),
    ).toBe(true);
    expect(inB.json().announcements.map((item: { title: string }) => item.title)).toContain(
      'Aviso de B',
    );
    expect(inA.json().announcements.map((item: { title: string }) => item.title)).not.toContain(
      'Aviso de B',
    );
    expect(inB.json().announcements.map((item: { title: string }) => item.title)).not.toContain(
      'Cierre del lunes',
    );

    const contactA = await app.inject({
      method: 'GET',
      url: '/v1/me/trainer-profile',
      headers: studentHeaders(student1, trainerA.tenantId),
    });
    const contactB = await app.inject({
      method: 'GET',
      url: '/v1/me/trainer-profile',
      headers: studentHeaders(student1, trainerB.tenantId),
    });
    expect(contactA.json().profile.whatsappUrl).toBe('https://wa.me/5491111111111');
    expect(contactB.json().profile.whatsappUrl).toBe('https://wa.me/5492222222222');
    expect(contactA.json().profile.whatsappUrl).not.toContain('5492222222222');
  });

  it('enqueues a generic push and does not send it twice', async () => {
    const registered = await app.inject({
      method: 'PUT',
      url: '/v1/devices/push-tokens',
      headers: studentHeaders(student1),
      payload: { token: TOKEN_A, platform: 'android', label: 'telefono' },
    });
    expect(registered.statusCode).toBe(200);

    const draft = await createDraft(trainerA, 'Aviso push', 'Texto privado del aviso.');
    const id = draft.json().id as string;
    await app.inject({
      method: 'POST',
      url: `/v1/communications/announcements/${id}/publish`,
      headers: trainerHeaders(trainerA),
    });

    const stored = await migrator.sql<
      { payload: { title: string; body: string; data: Record<string, string> } }[]
    >`
      SELECT payload FROM notification_deliveries WHERE entity_id = ${id}
    `;
    expect(stored.length).toBeGreaterThan(0);
    expect(stored[0]?.payload).toEqual({
      title: PUSH_COPY.announcement.title,
      body: PUSH_COPY.announcement.body,
      data: { kind: 'announcement', entityId: id, tenantId: trainerA.tenantId },
    });
    expect(JSON.stringify(stored[0]?.payload)).not.toContain('Texto privado');

    const before = push.attempts.length;
    const first = await processNotificationQueue(appSql, push, 20);
    const second = await processNotificationQueue(appSql, push, 20);
    expect(first.sent).toBeGreaterThan(0);
    expect(second.sent).toBe(0);
    const attempts = push.attempts.slice(before);
    expect(attempts.every((item) => item.body === PUSH_COPY.announcement.body)).toBe(true);
    expect(attempts.some((item) => JSON.stringify(item).includes('Texto privado'))).toBe(false);

    const hiddenQueue = await withTenantContext(
      appSql,
      {
        realm: 'daminatofit',
        userId: student1.userId,
        tenantId: student1.tenantId,
        membershipId: student1.membershipId,
        role: 'student',
      },
      async (tx) => tx<{ n: number }[]>`SELECT count(*)::int AS n FROM notification_deliveries`,
    );
    expect(hiddenQueue[0]?.n).toBe(0);
  });

  it('retries a failed mock send once and then stays idempotent', async () => {
    const registered = await app.inject({
      method: 'PUT',
      url: '/v1/devices/push-tokens',
      headers: studentHeaders(student2),
      payload: { token: TOKEN_B, platform: 'ios' },
    });
    expect(registered.statusCode).toBe(200);
    push.failNext({ ok: false, error: 'transient', message: 'offline' });
    const sent = await app.inject({
      method: 'POST',
      url: '/v1/communications/messages',
      headers: trainerHeaders(trainerA),
      payload: { membershipId: student2.membershipId, body: 'Mensaje secreto de reintento.' },
    });
    const id = sent.json().id as string;
    const before = push.attempts.length;
    await processNotificationQueue(appSql, push, 20);
    const failed = await migrator.sql<{ status: string; payload: { body: string } }[]>`
      SELECT status, payload FROM notification_deliveries WHERE entity_id = ${id}
    `;
    expect(failed[0]?.status).toBe('failed');
    expect(failed[0]?.payload.body).toBe(PUSH_COPY.direct_message.body);
    expect(JSON.stringify(failed[0]?.payload)).not.toContain('secreto');

    await migrator.sql`
      UPDATE notification_deliveries
      SET next_attempt_at = now()
      WHERE entity_id = ${id}
    `;
    await processNotificationQueue(appSql, push, 20);
    const done = await migrator.sql<{ status: string; provider_ticket: string }[]>`
      SELECT status, provider_ticket FROM notification_deliveries WHERE entity_id = ${id}
    `;
    expect(done[0]?.status).toBe('sent');
    expect(done[0]?.provider_ticket.startsWith('mock-')).toBe(true);
    const afterRetry = push.attempts.length;
    await processNotificationQueue(appSql, push, 20);
    expect(push.attempts.length).toBe(afterRetry);
    expect(push.attempts.length - before).toBe(2);
  });

  it('retires an invalid token and skips a revoked membership', async () => {
    const invalidToken = 'ExponentPushToken[phase6invalidtokenaaa]';
    const late = await inviteStudent(app, trainerA, 'student-push-c@example.com');
    await app.inject({
      method: 'PUT',
      url: '/v1/devices/push-tokens',
      headers: studentHeaders(late),
      payload: { token: invalidToken, platform: 'android' },
    });
    push.failNext({ ok: false, error: 'invalid_token', message: 'DeviceNotRegistered' });
    const sent = await app.inject({
      method: 'POST',
      url: '/v1/communications/messages',
      headers: trainerHeaders(trainerA),
      payload: { membershipId: late.membershipId, body: 'No mostrar este texto.' },
    });
    const id = sent.json().id as string;
    await processNotificationQueue(appSql, push, 20);
    const row = await migrator.sql<{ status: string }[]>`
      SELECT status FROM notification_deliveries WHERE entity_id = ${id}
    `;
    expect(row[0]?.status).toBe('invalid_token');
    const device = await migrator.sql<{ status: string }[]>`
      SELECT status FROM push_devices WHERE expo_push_token = ${invalidToken}
    `;
    expect(device[0]?.status).toBe('invalid');
    const attempts = push.attempts.length;
    await processNotificationQueue(appSql, push, 20);
    expect(push.attempts.length).toBe(attempts);

    const other = await inviteStudent(app, trainerA, 'student-revoked-c@example.com');
    const token = 'ExponentPushToken[phase6revokedtokenaaa]';
    await app.inject({
      method: 'PUT',
      url: '/v1/devices/push-tokens',
      headers: studentHeaders(other),
      payload: { token, platform: 'android' },
    });
    const message = await app.inject({
      method: 'POST',
      url: '/v1/communications/messages',
      headers: trainerHeaders(trainerA),
      payload: { membershipId: other.membershipId, body: 'Ya no es alumno.' },
    });
    await migrator.sql`
      UPDATE memberships
      SET status = 'archived', deactivated_at = now(), updated_at = now()
      WHERE id = ${other.membershipId}
    `;
    const before = push.attempts.length;
    await processNotificationQueue(appSql, push, 20);
    expect(push.attempts.length).toBe(before);
    const skipped = await migrator.sql<{ status: string; last_error: string }[]>`
      SELECT status, last_error FROM notification_deliveries WHERE entity_id = ${message.json().id}
    `;
    expect(skipped[0]?.status).toBe('skipped');
    expect(skipped[0]?.last_error).toBe('membership_inactive');
  });

  it('respects preferences and revokes tokens before send', async () => {
    const pref = await app.inject({
      method: 'PATCH',
      url: '/v1/notification-preferences',
      headers: studentHeaders(student1),
      payload: { pushDirectMessages: false },
    });
    expect(pref.statusCode).toBe(200);
    const silenced = await app.inject({
      method: 'POST',
      url: '/v1/communications/messages',
      headers: trainerHeaders(trainerA),
      payload: { membershipId: student1.membershipId, body: 'Sin push.' },
    });
    const none = await migrator.sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM notification_deliveries WHERE entity_id = ${silenced.json().id}
    `;
    expect(none[0]?.n).toBe(0);

    await app.inject({
      method: 'PATCH',
      url: '/v1/notification-preferences',
      headers: studentHeaders(student1),
      payload: { pushDirectMessages: true },
    });
    const pending = await app.inject({
      method: 'POST',
      url: '/v1/communications/messages',
      headers: trainerHeaders(trainerA),
      payload: { membershipId: student1.membershipId, body: 'Con token activo.' },
    });
    const revoked = await app.inject({
      method: 'DELETE',
      url: '/v1/devices/push-tokens',
      headers: studentHeaders(student1),
      payload: { token: TOKEN_A },
    });
    expect(revoked.statusCode).toBe(200);
    const state = await migrator.sql<{ status: string; last_error: string | null }[]>`
      SELECT status, last_error FROM notification_deliveries WHERE entity_id = ${pending.json().id}
    `;
    expect(state[0]?.status).toBe('skipped');
    expect(state[0]?.last_error).toBe('token_revoked');

    const otherDevices = await withTenantContext(
      appSql,
      {
        realm: 'daminatofit',
        userId: student2.userId,
        tenantId: student2.tenantId,
        membershipId: student2.membershipId,
        role: 'student',
      },
      async (tx) =>
        tx<{ n: number }[]>`
          SELECT count(*)::int AS n FROM push_devices WHERE expo_push_token = ${TOKEN_A}
        `,
    );
    expect(otherDevices[0]?.n).toBe(0);
  });

  it('rejects oversized content, stores markup as text, and blocks the other brand', async () => {
    const huge = await createDraft(trainerA, 'x'.repeat(121), 'cuerpo');
    expect(huge.statusCode).toBe(400);
    const nul = await createDraft(trainerA, 'Titulo', 'hola\u0000');
    expect(nul.statusCode).toBe(400);

    const literal = await createDraft(trainerA, 'Aviso HTML', '<b>no es html</b>');
    expect(literal.statusCode).toBe(201);
    const listed = await app.inject({
      method: 'GET',
      url: `/v1/communications/announcements/${literal.json().id}`,
      headers: trainerHeaders(trainerA),
    });
    expect(listed.json().announcement.body).toBe('<b>no es html</b>');

    let limited = false;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const created = await createDraft(trainerA, `Cupo ${attempt}`, 'cuerpo');
      const result = await app.inject({
        method: 'POST',
        url: `/v1/communications/announcements/${created.json().id}/publish`,
        headers: trainerHeaders(trainerA),
      });
      if (result.statusCode === 429) {
        limited = true;
        break;
      }
    }
    expect(limited).toBe(true);

    let messageLimited = false;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const result = await app.inject({
        method: 'POST',
        url: '/v1/communications/messages',
        headers: trainerHeaders(trainerA),
        payload: { membershipId: student1.membershipId, body: `Cupo mensaje ${attempt}` },
      });
      if (result.statusCode === 429) {
        messageLimited = true;
        break;
      }
    }
    expect(messageLimited).toBe(true);

    const wrongBrand = await app.inject({
      method: 'GET',
      url: '/v1/communications/announcements',
      headers: authHeaders(
        'pupiapp',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
    });
    expect(wrongBrand.statusCode).toBe(401);
  });
});
