import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import * as schema from './schema';

export type Db = PostgresJsDatabase<typeof schema>;

export interface DbHandles {
  sql: Sql;
  db: Db;
}

export function createDb(connectionString: string): DbHandles {
  const sql = postgres(connectionString, { max: 10, prepare: false });
  const db = drizzle(sql, { schema });
  return { sql, db };
}

export async function closeDb(handles: DbHandles | null | undefined): Promise<void> {
  if (!handles) return;
  await handles.sql.end({ timeout: 5 });
}
