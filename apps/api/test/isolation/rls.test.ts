import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, type DbHandles } from '../../src/db/client';
import { withTenantContext } from '../../src/db/tenant-tx';
import { openAppDb, openMigratorDb, resetDatabase } from '../db';
import { actor, seedScenario, type ScenarioIds } from '../fixtures/scenario';

describe('isolation levels 2–6 — RLS and realm boundaries', () => {
  let migrator: DbHandles;
  let app: DbHandles;
  let ids: ScenarioIds;

  beforeAll(async () => {
    await resetDatabase();
    migrator = await openMigratorDb();
    ids = await seedScenario(migrator.sql);
    app = await openAppDb();
  });

  afterAll(async () => {
    await closeDb(app);
    await closeDb(migrator);
  });

  it('blocks a trainer from reading another trainer private data (even without a tenant filter)', async () => {
    const rows = await withTenantContext(app.sql, actor.trainerA(ids), async (tx) => {
      return tx<{ id: string; body: string }[]>`
        SELECT id, body FROM direct_messages
      `;
    });
    expect(rows.map((r) => r.id).sort()).toEqual([ids.messages.toS1, ids.messages.toS2T1].sort());

    const foreign = await withTenantContext(app.sql, actor.trainerA(ids), async (tx) => {
      return tx<{ n: number }[]>`
        SELECT count(*)::int AS n FROM announcements WHERE tenant_id = ${ids.tenants.t2}
      `;
    });
    expect(foreign[0]?.n).toBe(0);

    const profiles = await withTenantContext(app.sql, actor.trainerA(ids), async (tx) => {
      return tx<{ tenant_id: string }[]>`SELECT tenant_id FROM trainer_profiles`;
    });
    expect(profiles.map((p) => p.tenant_id)).toEqual([ids.tenants.t1]);
  });

  it('blocks a student from reading another student private messages', async () => {
    const own = await withTenantContext(app.sql, actor.studentS1(ids), async (tx) => {
      return tx<{ id: string }[]>`SELECT id FROM direct_messages`;
    });
    expect(own.map((r) => r.id)).toEqual([ids.messages.toS1]);

    const other = await withTenantContext(app.sql, actor.studentS1(ids), async (tx) => {
      return tx<{ n: number }[]>`
        SELECT count(*)::int AS n FROM direct_messages WHERE id = ${ids.messages.toS2T1}
      `;
    });
    expect(other[0]?.n).toBe(0);
  });

  it('keeps S2 spaces separate across two trainers', async () => {
    const inT1 = await withTenantContext(app.sql, actor.studentS2InT1(ids), async (tx) => {
      return tx<{ id: string }[]>`SELECT id FROM announcements`;
    });
    expect(inT1.map((r) => r.id)).toEqual([ids.announcements.t1]);

    const inT2 = await withTenantContext(app.sql, actor.studentS2InT2(ids), async (tx) => {
      return tx<{ id: string }[]>`SELECT id FROM announcements`;
    });
    expect(inT2.map((r) => r.id)).toEqual([ids.announcements.t2]);

    const trainerBSeesS2T1Message = await withTenantContext(
      app.sql,
      actor.trainerB(ids),
      async (tx) =>
        tx<{ n: number }[]>`
          SELECT count(*)::int AS n FROM direct_messages WHERE id = ${ids.messages.toS2T1}
        `,
    );
    expect(trainerBSeesS2T1Message[0]?.n).toBe(0);
  });

  it('isolates PupiApp from DaminatoFit private data and vice versa', async () => {
    const pupiAnnouncements = await withTenantContext(app.sql, actor.trainerP(ids), async (tx) => {
      return tx<{ n: number }[]>`SELECT count(*)::int AS n FROM announcements`;
    });
    expect(pupiAnnouncements[0]?.n).toBe(0);

    const pupiTenants = await withTenantContext(app.sql, actor.trainerP(ids), async (tx) => {
      return tx<{ id: string }[]>`SELECT id FROM tenants`;
    });
    expect(pupiTenants.map((t) => t.id)).toEqual([ids.tenants.tp]);

    const damiSeesPupi = await withTenantContext(app.sql, actor.trainerA(ids), async (tx) => {
      return tx<{ n: number }[]>`
        SELECT count(*)::int AS n FROM tenants WHERE id = ${ids.tenants.tp}
      `;
    });
    expect(damiSeesPupi[0]?.n).toBe(0);

    const brands = await withTenantContext(app.sql, actor.studentSP(ids), async (tx) => {
      return tx<{ slug: string }[]>`SELECT slug FROM brands ORDER BY slug`;
    });
    expect(brands.map((b) => b.slug)).toEqual(['pupiapp']);
  });

  it('allows authenticated users to read the global muscle catalogue', async () => {
    const rows = await withTenantContext(app.sql, actor.studentS1(ids), async (tx) => {
      return tx<{ slug: string }[]>`SELECT slug FROM muscle_groups`;
    });
    expect(rows.map((r) => r.slug)).toEqual(['chest']);

    await expect(
      withTenantContext(app.sql, actor.studentS1(ids), async (tx) => {
        await tx`INSERT INTO muscle_groups (slug, name) VALUES ('back', 'Espalda')`;
      }),
    ).rejects.toThrow();
  });

  it('rejects cross-realm memberships and a second PupiApp tenant', async () => {
    await expect(
      migrator.sql`
        INSERT INTO memberships (tenant_id, user_id, role, status)
        VALUES (${ids.tenants.t1}, ${ids.users.studentSP}, 'student', 'active')
      `,
    ).rejects.toThrow(/realm mismatch/i);

    await expect(
      migrator.sql`
        INSERT INTO tenants (brand_id, kind, name, owner_user_id)
        VALUES (${ids.brands.pupiapp}, 'trainer', 'Second Pupi tenant', ${ids.users.trainerP})
      `,
    ).rejects.toThrow(/max_tenants/i);
  });

  it('prevents students from writing announcements or messages', async () => {
    await expect(
      withTenantContext(app.sql, actor.studentS1(ids), async (tx) => {
        await tx`
          INSERT INTO announcements (tenant_id, author_user_id, title, body, published_at)
          VALUES (${ids.tenants.t1}, ${ids.users.studentS1}, 'Nope', 'Nope', now())
        `;
      }),
    ).rejects.toThrow();

    await expect(
      withTenantContext(app.sql, actor.studentS1(ids), async (tx) => {
        await tx`
          INSERT INTO direct_messages (tenant_id, sender_user_id, recipient_membership_id, body)
          VALUES (${ids.tenants.t1}, ${ids.users.studentS1}, ${ids.memberships.s2T1}, 'Nope')
        `;
      }),
    ).rejects.toThrow();
  });
});
