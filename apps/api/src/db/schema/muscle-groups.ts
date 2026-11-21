import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** Global catalogue (no tenant_id). Readable by any authenticated context. */
export const muscleGroups = pgTable('muscle_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
