import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { memberships } from './memberships';
import { tenants } from './tenants';
import { users } from './users';

export const directMessages = pgTable('direct_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  senderUserId: uuid('sender_user_id')
    .notNull()
    .references(() => users.id),
  recipientMembershipId: uuid('recipient_membership_id')
    .notNull()
    .references(() => memberships.id),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  readAt: timestamp('read_at', { withTimezone: true }),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
});
