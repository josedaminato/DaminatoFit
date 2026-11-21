import {
  APP_BRAND_HEADER,
  recommendationWhatsappMessage,
  TENANT_ID_HEADER,
} from '@daminatofit/contracts';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app';
import { loadEnv } from '../../src/config/env';
import { closeDb, type DbHandles } from '../../src/db/client';
import { withTenantContext } from '../../src/db/tenant-tx';
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

describe('phase 8 — trainer recommendations', () => {
  let app: FastifyInstance;
  let migrator: DbHandles;
  let appDb: DbHandles;
  let admin: Session;
  let trainerA: { session: Session; tenantId: string; userId: string };
  let trainerB: { session: Session; tenantId: string; userId: string };
  let student: Session;
  let nutritionistId = '';
  let storeId = '';
  let suspiciousId = '';

  beforeAll(async () => {
    await resetDatabase();
    migrator = await openMigratorDb();
    appDb = await openAppDb();
    const env = loadEnv({
      ...process.env,
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      BETTER_AUTH_SECRET:
        process.env.BETTER_AUTH_SECRET ?? 'test_secret_daminatofit_phase8_32chars!',
      PLATFORM_ADMIN_PROVISION_SECRET: 'phase8_admin_provision',
      PUSH_PROVIDER: 'mock',
      PUSH_AUTOPROCESS: 'false',
    });
    app = (await buildApp(env, { migrator, appDb })).app;

    const adminEmail = 'admin.phase8@example.com';
    const signUp = await app.inject({
      method: 'POST',
      url: '/auth/daminatofit/sign-up/email',
      headers: { 'content-type': 'application/json' },
      payload: { email: adminEmail, password: 'password123', name: 'Admin Phase8' },
    });
    expect(signUp.statusCode).toBe(200);
    const authUserId = signUp.json().user.id as string;
    await migrator.sql`SELECT app.ensure_domain_user('daminatofit', ${authUserId}, ${'Admin Phase8'})`;
    const domain = await migrator.sql<{ id: string }[]>`
      SELECT id FROM users WHERE realm = 'daminatofit' AND auth_user_id = ${authUserId}
    `;
    await migrator.sql`SELECT app.grant_platform_admin(${domain[0]!.id}::uuid)`;
    admin = pickSession(
      await app.inject({
        method: 'POST',
        url: '/auth/daminatofit/sign-in/email',
        headers: { 'content-type': 'application/json' },
        payload: { email: adminEmail, password: 'password123' },
      }),
    );

    async function registerTrainer(email: string, businessName: string) {
      const reg = await app.inject({
        method: 'POST',
        url: '/v1/trainers/register',
        headers: authHeaders('daminatofit'),
        payload: { name: businessName, email, password: 'password123', businessName },
      });
      expect(reg.statusCode).toBe(201);
      const session = pickSession(
        await app.inject({
          method: 'POST',
          url: '/auth/daminatofit/sign-in/email',
          headers: { 'content-type': 'application/json' },
          payload: { email, password: 'password123' },
        }),
      );
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

    trainerA = await registerTrainer('trainer.a.phase8@example.com', 'Espacio A');
    trainerB = await registerTrainer('trainer.b.phase8@example.com', 'Espacio B');
    const profile = await app.inject({
      method: 'PATCH',
      url: '/v1/me/trainer-profile',
      headers: authHeaders(
        'daminatofit',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
      payload: { displayName: 'Martín González' },
    });
    expect(profile.statusCode).toBe(200);

    const studentEmail = 'student.phase8@example.com';
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
            ? { token, name: 'Alumno Fase8', password: 'password123' }
            : { token, password: 'password123' },
      });
      expect(accepted.statusCode).toBe(200);
    }
    student = pickSession(
      await app.inject({
        method: 'POST',
        url: '/auth/daminatofit/sign-in/email',
        headers: { 'content-type': 'application/json' },
        payload: { email: studentEmail, password: 'password123' },
      }),
    );
  }, 90_000);

  afterAll(async () => {
    await app?.close();
    await closeDb(appDb);
    await closeDb(migrator);
  });

  function trainerHeaders(trainer: { session: Session; tenantId: string }) {
    return authHeaders(
      'daminatofit',
      trainer.session.cookie,
      trainer.tenantId,
      trainer.session.bearer,
    );
  }

  it('lets a trainer publish a simple recommendation and a benefit, and isolates the other trainer', async () => {
    const categories = await app.inject({
      method: 'GET',
      url: '/v1/recommendation-categories',
      headers: trainerHeaders(trainerA),
    });
    expect(categories.statusCode).toBe(200);
    const slugs = categories.json().items.map((item: { slug: string }) => item.slug);
    expect(slugs).toEqual(expect.arrayContaining(['nutrition', 'equipment', 'other']));

    const studentWrite = await app.inject({
      method: 'POST',
      url: '/v1/recommendations',
      headers: authHeaders('daminatofit', student.cookie, trainerA.tenantId, student.bearer),
      payload: {
        categorySlug: 'other',
        name: 'No debería',
        destinationKind: 'website',
        destinationUrl: 'https://no.example',
      },
    });
    expect(studentWrite.statusCode).toBe(403);

    const unsafe = await app.inject({
      method: 'POST',
      url: '/v1/recommendations',
      headers: trainerHeaders(trainerA),
      payload: {
        categorySlug: 'other',
        name: 'Enlace malo',
        destinationKind: 'website',
        destinationUrl: 'javascript:alert(1)',
        commercialDeclared: false,
      },
    });
    expect(unsafe.statusCode).toBe(400);

    const simple = await app.inject({
      method: 'POST',
      url: '/v1/recommendations',
      headers: trainerHeaders(trainerA),
      payload: {
        categorySlug: 'nutrition',
        name: 'Nutricionista amigo',
        description: 'Recomendación personal, sin acuerdo comercial.',
        destinationKind: 'website',
        destinationUrl: 'https://nutri.example/amigo',
        professionalLicense: 'MN-00000',
        commercialDeclared: false,
      },
    });
    expect(simple.statusCode).toBe(201);
    nutritionistId = simple.json().id as string;

    const store = await app.inject({
      method: 'POST',
      url: '/v1/recommendations',
      headers: trainerHeaders(trainerA),
      payload: {
        categorySlug: 'equipment',
        name: 'Tienda deportiva ficticia',
        destinationKind: 'whatsapp',
        destinationUrl: 'https://wa.me/5491100000000',
        benefitDescription: 'el descuento del 15 %',
        promoCode: 'MARTIN15',
        commercialDeclared: true,
      },
    });
    expect(store.statusCode).toBe(201);
    storeId = store.json().id as string;

    const edited = await app.inject({
      method: 'PATCH',
      url: `/v1/recommendations/${storeId}`,
      headers: trainerHeaders(trainerA),
      payload: {
        categorySlug: 'equipment',
        name: 'Tienda deportiva ficticia',
        destinationKind: 'whatsapp',
        destinationUrl: 'https://wa.me/5491100000000?text=ignorado',
        benefitDescription: 'el descuento del 15 %',
        promoCode: 'MARTIN15',
        commercialDeclared: true,
      },
    });
    expect(edited.statusCode).toBe(200);

    for (const id of [nutritionistId, storeId]) {
      const published = await app.inject({
        method: 'POST',
        url: `/v1/recommendations/${id}/publish`,
        headers: trainerHeaders(trainerA),
      });
      expect(published.statusCode).toBe(200);
    }

    const reordered = await app.inject({
      method: 'POST',
      url: '/v1/recommendations/reorder',
      headers: trainerHeaders(trainerA),
      payload: { ids: [storeId, nutritionistId] },
    });
    expect(reordered.statusCode).toBe(200);
    const own = await app.inject({
      method: 'GET',
      url: '/v1/recommendations',
      headers: trainerHeaders(trainerA),
    });
    expect(own.json().items.map((item: { id: string }) => item.id)).toEqual([
      storeId,
      nutritionistId,
    ]);
    expect(own.json().items[0].promoCode).toBe('MARTIN15');
    expect(own.json().items[0].destinationUrl).toBe('https://wa.me/5491100000000');

    const other = await app.inject({
      method: 'GET',
      url: `/v1/recommendations/${storeId}`,
      headers: trainerHeaders(trainerB),
    });
    expect(other.statusCode).toBe(404);
    const otherList = await app.inject({
      method: 'GET',
      url: '/v1/recommendations',
      headers: trainerHeaders(trainerB),
    });
    expect(otherList.json().items).toEqual([]);

    const wrongBrand = await app.inject({
      method: 'GET',
      url: '/v1/recommendations',
      headers: authHeaders(
        'pupiapp',
        trainerA.session.cookie,
        trainerA.tenantId,
        trainerA.session.bearer,
      ),
    });
    expect(wrongBrand.statusCode).toBe(401);

    const studentA = await app.inject({
      method: 'GET',
      url: '/v1/recommendations/published',
      headers: authHeaders('daminatofit', student.cookie, trainerA.tenantId, student.bearer),
    });
    expect(studentA.statusCode).toBe(200);
    expect(studentA.json().items).toHaveLength(2);
    const storeCard = studentA.json().items.find((row: { id: string }) => row.id === storeId);
    expect(storeCard.promoCode).toBe('MARTIN15');
    expect(storeCard.benefitActive).toBe(true);
    expect(storeCard.trainerName).toBe('Martín González');
    expect(storeCard.certifiedByPlatform).toBe(false);
    expect(
      recommendationWhatsappMessage({
        trainerName: storeCard.trainerName,
        benefitDescription: storeCard.benefitDescription,
        promoCode: storeCard.promoCode,
        benefitActive: true,
      }),
    ).toBe(
      'Hola, vengo de parte del profesor Martín González. Quisiera consultar por el descuento del 15 % utilizando el código MARTIN15.',
    );
    const friend = studentA.json().items.find((row: { id: string }) => row.id === nutritionistId);
    expect(friend.commercialDeclared).toBe(false);
    expect(friend.promoCode).toBeNull();
    expect(friend.licenseVerifiedByPlatform).toBe(false);

    const studentB = await app.inject({
      method: 'GET',
      url: '/v1/recommendations/published',
      headers: authHeaders('daminatofit', student.cookie, trainerB.tenantId, student.bearer),
    });
    expect(studentB.json().items).toEqual([]);

    const hidden = await app.inject({
      method: 'POST',
      url: `/v1/recommendations/${nutritionistId}/hide`,
      headers: trainerHeaders(trainerA),
    });
    expect(hidden.statusCode).toBe(200);
    const whileHidden = await app.inject({
      method: 'GET',
      url: '/v1/recommendations/published',
      headers: authHeaders('daminatofit', student.cookie, trainerA.tenantId, student.bearer),
    });
    expect(whileHidden.json().items.map((row: { id: string }) => row.id)).toEqual([storeId]);
    const republish = await app.inject({
      method: 'POST',
      url: `/v1/recommendations/${nutritionistId}/publish`,
      headers: trainerHeaders(trainerA),
    });
    expect(republish.statusCode).toBe(200);
  });

  it('keeps an expired benefit off the current offer and moderates a report without the migrator connection', async () => {
    const expired = await app.inject({
      method: 'POST',
      url: '/v1/recommendations',
      headers: trainerHeaders(trainerA),
      payload: {
        categorySlug: 'other',
        name: 'Promo vencida ficticia',
        destinationKind: 'website',
        destinationUrl: 'https://promo-vencida.example',
        benefitDescription: 'envío gratis',
        promoCode: 'VIEJO',
        benefitExpiresOn: '2020-01-01',
        commercialDeclared: true,
      },
    });
    expect(expired.statusCode).toBe(201);
    await app.inject({
      method: 'POST',
      url: `/v1/recommendations/${expired.json().id}/publish`,
      headers: trainerHeaders(trainerA),
    });
    const published = await app.inject({
      method: 'GET',
      url: '/v1/recommendations/published',
      headers: authHeaders('daminatofit', student.cookie, trainerA.tenantId, student.bearer),
    });
    const expiredCard = published
      .json()
      .items.find((row: { id: string }) => row.id === expired.json().id);
    expect(expiredCard.benefitActive).toBe(false);
    expect(expiredCard.benefitExpired).toBe(true);
    expect(expiredCard.promoCode).toBeNull();

    const suspicious = await app.inject({
      method: 'POST',
      url: '/v1/recommendations',
      headers: trainerHeaders(trainerA),
      payload: {
        categorySlug: 'other_services',
        name: 'Enlace a revisar',
        destinationKind: 'maps',
        destinationUrl: 'https://maps.google.com/?q=local-ficticio',
        commercialDeclared: false,
      },
    });
    suspiciousId = suspicious.json().id as string;
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/v1/recommendations/${suspiciousId}/publish`,
          headers: trainerHeaders(trainerA),
        })
      ).statusCode,
    ).toBe(200);

    const report = await app.inject({
      method: 'POST',
      url: `/v1/recommendations/${suspiciousId}/report`,
      headers: authHeaders('daminatofit', student.cookie, trainerA.tenantId, student.bearer),
      payload: {
        reason: 'suspicious_link',
        details: 'El destino no corresponde al local anunciado.',
      },
    });
    expect(report.statusCode).toBe(201);
    const duplicate = await app.inject({
      method: 'POST',
      url: `/v1/recommendations/${suspiciousId}/report`,
      headers: authHeaders('daminatofit', student.cookie, trainerA.tenantId, student.bearer),
      payload: { reason: 'suspicious_link' },
    });
    expect(duplicate.statusCode).toBe(409);

    const trainerReports = await withTenantContext(
      appDb.sql,
      {
        realm: 'daminatofit',
        userId: trainerA.userId,
        tenantId: trainerA.tenantId,
        membershipId: null,
        role: 'owner',
      },
      (tx) => tx<{ n: number }[]>`SELECT count(*)::int AS n FROM recommendation_reports`,
    );
    expect(trainerReports[0]?.n).toBe(0);

    const summary = await app.inject({
      method: 'GET',
      url: '/v1/admin/recommendations/summary',
      headers: authHeaders('daminatofit', admin.cookie, undefined, admin.bearer),
    });
    expect(summary.statusCode).toBe(200);
    const byBrand = Object.fromEntries(
      summary
        .json()
        .brands.map((row: { brand: string; published: number; openReports: number }) => [
          row.brand,
          row,
        ]),
    );
    expect(byBrand.daminatofit.published).toBeGreaterThan(0);
    expect(byBrand.daminatofit.openReports).toBeGreaterThan(0);
    expect(byBrand.pupiapp.published).toBe(0);
    expect(byBrand.pupiapp.openReports).toBe(0);

    const reports = await app.inject({
      method: 'GET',
      url: '/v1/admin/recommendations/reports?brand=daminatofit',
      headers: authHeaders('daminatofit', admin.cookie, undefined, admin.bearer),
    });
    expect(reports.statusCode).toBe(200);
    const open = reports
      .json()
      .items.find((row: { recommendationId: string }) => row.recommendationId === suspiciousId);
    expect(open.reason).toBe('suspicious_link');
    expect(JSON.stringify(open)).not.toContain('student.phase8@example.com');

    const hidden = await app.inject({
      method: 'POST',
      url: '/v1/admin/recommendations/moderate',
      headers: authHeaders('daminatofit', admin.cookie, undefined, admin.bearer),
      payload: {
        action: 'hide',
        reason: 'Enlace que no coincide con el local anunciado.',
        reportId: open.id,
        confirm: true,
      },
    });
    expect(hidden.statusCode).toBe(200);
    expect(hidden.json().moderationHidden).toBe(true);

    const after = await app.inject({
      method: 'GET',
      url: '/v1/recommendations/published',
      headers: authHeaders('daminatofit', student.cookie, trainerA.tenantId, student.bearer),
    });
    expect(after.json().items.map((row: { id: string }) => row.id)).not.toContain(suspiciousId);

    const republish = await app.inject({
      method: 'POST',
      url: `/v1/recommendations/${suspiciousId}/publish`,
      headers: trainerHeaders(trainerA),
    });
    expect(republish.statusCode).toBe(409);

    const archived = await app.inject({
      method: 'POST',
      url: `/v1/recommendations/${expired.json().id}/archive`,
      headers: trainerHeaders(trainerA),
    });
    expect(archived.statusCode).toBe(200);
    const stillThere = await app.inject({
      method: 'GET',
      url: '/v1/recommendations/published',
      headers: authHeaders('daminatofit', student.cookie, trainerA.tenantId, student.bearer),
    });
    expect(stillThere.json().items.map((row: { id: string }) => row.id)).not.toContain(
      expired.json().id,
    );

    const trainerDenied = await app.inject({
      method: 'GET',
      url: '/v1/admin/recommendations/reports',
      headers: trainerHeaders(trainerA),
    });
    expect(trainerDenied.statusCode).toBe(403);
  });
});
