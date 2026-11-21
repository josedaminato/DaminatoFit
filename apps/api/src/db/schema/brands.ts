import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const brands = pgTable('brands', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  distribution: text('distribution').notNull(), // platform | standalone
  realm: text('realm').notNull(),
  maxTenants: integer('max_tenants'),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Brand = typeof brands.$inferSelect;
