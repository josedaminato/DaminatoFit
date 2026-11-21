export * from './admin';
export * from './announcements';
export * from './audit';
export * from './auth-tables';
export * from './brands';
export * from './invitations';
export * from './memberships';
export * from './messages';
export * from './notifications';
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
  'push_devices',
  'notification_preferences',
  'commercial_rule_versions',
  'referral_attributions',
  'platform_admin_audit',
  'platform_metric_snapshots',
  'recommendation_categories',
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
  'routine_plans',
  'routine_versions',
  'routine_version_days',
  'routine_version_exercises',
  'routine_version_sets',
  'workout_sessions',
  'workout_set_logs',
  'audit_logs',
  'push_devices',
  'notification_preferences',
  'notification_deliveries',
  'commercial_rule_versions',
  'referral_attributions',
  'platform_admin_audit',
  'platform_metric_snapshots',
  'recommendation_categories',
  'trainer_recommendations',
  'recommendation_reports',
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
  'routine_plans',
  'routine_versions',
  'routine_version_days',
  'routine_version_exercises',
  'routine_version_sets',
  'workout_sessions',
  'workout_set_logs',
  'audit_logs',
  'notification_deliveries',
  'trainer_recommendations',
  'recommendation_reports',
] as const;
