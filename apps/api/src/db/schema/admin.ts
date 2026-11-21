import { bigint, date, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const commercialRuleVersions = pgTable('commercial_rule_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  version: integer('version').notNull(),
  currency: text('currency').notNull().default('USD'),
  priceCentsPerBillableStudent: integer('price_cents_per_billable_student').notNull(),
  monthlyCapCents: integer('monthly_cap_cents').notNull(),
  billableBasis: text('billable_basis').notNull(),
  note: text('note').notNull().default(''),
  createdByUserId: uuid('created_by_user_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull().defaultNow(),
});

export const referralAttributions = pgTable('referral_attributions', {
  id: uuid('id').primaryKey().defaultRandom(),
  referrerTenantId: uuid('referrer_tenant_id').notNull(),
  referredTenantId: uuid('referred_tenant_id').notNull(),
  status: text('status').notNull().default('pending'),
  attributedMonth: date('attributed_month').notNull(),
  validatedAt: timestamp('validated_at', { withTimezone: true }),
  validationNote: text('validation_note').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const platformAdminAudit = pgTable('platform_admin_audit', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorUserId: uuid('actor_user_id'),
  action: text('action').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: uuid('resource_id'),
  result: text('result').notNull(),
  reason: text('reason'),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const platformMetricSnapshots = pgTable('platform_metric_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  brandSlug: text('brand_slug').notNull(),
  snapshotDate: date('snapshot_date').notNull(),
  trainersTotal: integer('trainers_total').notNull(),
  trainersActive: integer('trainers_active').notNull(),
  trainersPaused: integer('trainers_paused').notNull(),
  trainersArchived: integer('trainers_archived').notNull(),
  uniqueStudents: integer('unique_students').notNull(),
  membershipsActive: integer('memberships_active').notNull(),
  membershipsInactive: integer('memberships_inactive').notNull(),
  routinesCreated: integer('routines_created').notNull(),
  routinesAssigned: integer('routines_assigned').notNull(),
  sessionsCompleted: integer('sessions_completed').notNull(),
  sessionsAbandoned: integer('sessions_abandoned').notNull(),
  storageBytes: bigint('storage_bytes', { mode: 'number' }).notNull(),
  videoCount: integer('video_count').notNull(),
  logoCount: integer('logo_count').notNull(),
  estimatedMonthlyCents: integer('estimated_monthly_cents').notNull(),
  commercialRuleVersion: integer('commercial_rule_version').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
