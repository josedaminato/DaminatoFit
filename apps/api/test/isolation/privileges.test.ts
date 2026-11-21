import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, type DbHandles } from '../../src/db/client';
import { openAdminDb, openAppDb, openMigratorDb, resetDatabase } from '../db';

describe('database privileges', () => {
  let migrator: DbHandles;
  let app: DbHandles;
  let admin: DbHandles;

  beforeAll(async () => {
    await resetDatabase();
    migrator = await openMigratorDb();
    app = await openAppDb();
    admin = await openAdminDb();
  });

  afterAll(async () => {
    await closeDb(admin);
    await closeDb(app);
    await closeDb(migrator);
  });

  it('does not grant CREATE / DDL to app_user', async () => {
    await expect(app.sql.unsafe('CREATE TABLE should_not_exist (id int)')).rejects.toThrow();
  });

  it('does not grant BYPASSRLS through admin role either', async () => {
    const rows = await migrator.sql<{ rolbypassrls: boolean }[]>`
      SELECT rolbypassrls FROM pg_roles WHERE rolname = 'app_admin'
    `;
    expect(rows[0]?.rolbypassrls).toBe(false);
  });

  it('allows app_admin to manage the global catalogue while app_user cannot', async () => {
    await admin.sql`
      INSERT INTO muscle_groups (slug, name) VALUES ('priv-test-shoulders', 'Hombros (test)')
    `;

    const count = await admin.sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM muscle_groups WHERE slug = 'priv-test-shoulders'
    `;
    expect(count[0]?.n).toBe(1);

    await expect(
      app.sql`INSERT INTO muscle_groups (slug, name) VALUES ('priv-test-legs', 'Piernas (test)')`,
    ).rejects.toThrow();
  });
});
