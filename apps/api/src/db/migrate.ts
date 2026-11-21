import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import postgres from 'postgres';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

export async function migrate(connectionString: string): Promise<string[]> {
  const sql = postgres(connectionString, { max: 1, prepare: false });
  const applied: string[] = [];

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `;

    const files = (await readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort();

    for (const file of files) {
      const already = await sql<{ id: string }[]>`
        SELECT id FROM schema_migrations WHERE id = ${file}
      `;
      if (already.length > 0) continue;

      const body = await readFile(join(migrationsDir, file), 'utf8');
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`INSERT INTO schema_migrations (id) VALUES (${file})`;
      });
      applied.push(file);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }

  return applied;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required to run migrations');
  }
  const applied = await migrate(url);
  console.log(
    applied.length === 0
      ? 'Migrations already up to date'
      : `Applied migrations: ${applied.join(', ')}`,
  );
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === entry) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
