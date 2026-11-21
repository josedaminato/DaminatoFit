import { describe, expect, it } from 'vitest';
import { migrate } from '../../src/db/migrate';
import { migratorUrl, resetDatabase } from '../db';

describe('migrations', () => {
  it('applies cleanly from an empty database and is idempotent', async () => {
    await resetDatabase();
    const second = await migrate(migratorUrl());
    expect(second).toEqual([]);
  });
});
