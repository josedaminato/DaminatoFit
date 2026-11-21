export * from './announcements';
export * from './audit';
export * from './auth-tables';
export * from './brands';
export * from './invitations';
export * from './memberships';
export * from './messages';
export * from './muscle-groups';
export * from './tenants';
export * from './trainer-profiles';
export * from './users';

/** Tables that intentionally have no tenant_id. */
export const GLOBAL_OR_IDENTITY_TABLES = [
  'brands',
  'users',
  'tenants',
  'muscle_groups',
  'equipment',
  'announcement_reads',
  'schema_migrations',
] as const;

/** Every application table must enable + FORCE row level security. */
export const RLS_REQUIRED_TABLES = [
  'brands',
  'users',
  'tenants',
  'memberships',
  'membership_events',
  'invitations',
  'trainer_profiles',
  'announcements',
  'announcement_reads',
  'direct_messages',
  'muscle_groups',
  'equipment',
  'media_assets',
  'exercises',
  'exercise_revisions',
  'exercise_muscle_groups',
  'tenant_usage',
  'audit_logs',
] as const;

/** Tables that carry an explicit tenant_id column. */
export const TENANT_ID_TABLES = [
  'memberships',
  'membership_events',
  'invitations',
  'trainer_profiles',
  'announcements',
  'direct_messages',
  'media_assets',
  'exercises',
  'exercise_revisions',
  'tenant_usage',
  'audit_logs',
] as const;
