import { bigint, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { brands } from './brands';
import { users } from './users';

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  brandId: uuid('brand_id')
    .notNull()
    .references(() => brands.id),
  kind: text('kind').notNull().default('trainer'), // trainer | gym | provider (future)
  name: text('name').notNull(),
  ownerUserId: uuid('owner_user_id')
    .notNull()
    .references(() => users.id),
  branding: jsonb('branding').$type<Record<string, unknown>>().notNull().default({}),
  logoMediaId: uuid('logo_media_id'),
  storageQuotaBytes: bigint('storage_quota_bytes', { mode: 'number' }),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Tenant = typeof tenants.$inferSelect;
