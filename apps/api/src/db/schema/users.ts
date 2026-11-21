import { pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    realm: text('realm').notNull(),
    // Links to Better Auth in Phase 2; Phase 1 stores a stable placeholder UUID.
    authUserId: uuid('auth_user_id').notNull(),
    displayName: text('display_name').notNull(),
    avatarMediaId: uuid('avatar_media_id'),
    platformRole: text('platform_role').notNull().default('user'), // user | platform_admin
    status: text('status').notNull().default('active'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('users_realm_auth_user_id_uq').on(table.realm, table.authUserId)],
);

export type User = typeof users.$inferSelect;
