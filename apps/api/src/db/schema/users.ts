import { pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
// uuid kept for primary key; authUserId is text (Better Auth).

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    realm: text('realm').notNull(),
    // Better Auth user id (opaque text) in auth_<realm>."user".
    authUserId: text('auth_user_id').notNull(),
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
