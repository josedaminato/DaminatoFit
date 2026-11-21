import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

export const trainerProfiles = pgTable('trainer_profiles', {
  tenantId: uuid('tenant_id')
    .primaryKey()
    .references(() => tenants.id),
  displayName: text('display_name').notNull(),
  bio: text('bio'),
  whatsappE164: text('whatsapp_e164'),
  avatarMediaId: uuid('avatar_media_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type TrainerProfile = typeof trainerProfiles.$inferSelect;
