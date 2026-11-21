import { createDb, type DbHandles } from '../src/db/client';
import { migrate } from '../src/db/migrate';
import { withTenantContext, type TenantContext } from '../src/db/tenant-tx';
import type { Sql } from 'postgres';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is required for database tests. Copy .env.example to .env and run pnpm infra:up.`,
    );
  }
  return value;
}

export const migratorUrl = () => required('DATABASE_URL');
export const appUrl = () => required('DATABASE_URL_APP');
export const adminUrl = () => required('DATABASE_URL_ADMIN');

export async function resetDatabase(): Promise<void> {
  const sql = (await import('postgres')).default(migratorUrl(), { max: 1, prepare: false });
  try {
    await sql.unsafe(`
      DROP SCHEMA IF EXISTS app CASCADE;
      DROP SCHEMA public CASCADE;
      CREATE SCHEMA public;
      GRANT ALL ON SCHEMA public TO CURRENT_USER;
      GRANT ALL ON SCHEMA public TO public;
    `);
  } finally {
    await sql.end({ timeout: 5 });
  }
  await migrate(migratorUrl());
}

export async function openAppDb(): Promise<DbHandles> {
  return createDb(appUrl());
}

export async function openAdminDb(): Promise<DbHandles> {
  return createDb(adminUrl());
}

export async function openMigratorDb(): Promise<DbHandles> {
  return createDb(migratorUrl());
}

export function asContext(sql: Sql, context: TenantContext, query: string, params: unknown[] = []) {
  return withTenantContext(sql, context, async (tx) => tx.unsafe(query, params as never[]));
}
