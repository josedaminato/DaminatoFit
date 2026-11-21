import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RLS_REQUIRED_TABLES, TENANT_ID_TABLES } from '../../src/db/schema';
import { closeDb, type DbHandles } from '../../src/db/client';
import { openAppDb, openMigratorDb, resetDatabase } from '../db';

describe('isolation level 1 — RLS catalogue', () => {
  let migrator: DbHandles;
  let app: DbHandles;

  beforeAll(async () => {
    await resetDatabase();
    migrator = await openMigratorDb();
    app = await openAppDb();
  });

  afterAll(async () => {
    await closeDb(app);
    await closeDb(migrator);
  });

  it('forces RLS on every application table', async () => {
    const rows = await migrator.sql<
      {
        relname: string;
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }[]
    >`
      SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND c.relname = ANY(${RLS_REQUIRED_TABLES as unknown as string[]})
    `;

    expect(rows).toHaveLength(RLS_REQUIRED_TABLES.length);
    for (const row of rows) {
      expect(row.relrowsecurity, row.relname).toBe(true);
      expect(row.relforcerowsecurity, row.relname).toBe(true);
    }
  });

  it('keeps tenant_id on every tenant-scoped table', async () => {
    const rows = await migrator.sql<{ table_name: string }[]>`
      SELECT table_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name = 'tenant_id'
        AND table_name = ANY(${TENANT_ID_TABLES as unknown as string[]})
    `;
    expect(rows.map((r) => r.table_name).sort()).toEqual([...TENANT_ID_TABLES].sort());
  });

  it('denies BYPASSRLS to app_user and app_admin', async () => {
    const rows = await migrator.sql<{ rolname: string; rolbypassrls: boolean }[]>`
      SELECT rolname, rolbypassrls
      FROM pg_roles
      WHERE rolname IN ('app_user', 'app_admin', 'app_worker', 'app_backup')
    `;
    expect(rows.length).toBe(4);
    for (const row of rows) {
      expect(row.rolbypassrls, row.rolname).toBe(false);
    }
  });

  it('returns zero rows for app_user without tenant context', async () => {
    const tables = [
      'tenants',
      'memberships',
      'announcements',
      'direct_messages',
      'trainer_profiles',
      'push_devices',
      'notification_preferences',
      'notification_deliveries',
      'referral_attributions',
      'platform_admin_audit',
      'platform_metric_snapshots',
    ];
    for (const table of tables) {
      const rows = await app.sql.unsafe(`SELECT count(*)::int AS n FROM ${table}`);
      expect(rows[0]?.n, table).toBe(0);
    }
  });
});
