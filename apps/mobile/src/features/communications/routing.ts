const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface NotificationRoute {
  tenantId: string;
  pathname: string;
}

/** Push data may only carry ids. The screen loads the text after auth. */
export function routeForNotificationData(data: unknown): NotificationRoute | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  if (record.kind !== 'announcement' && record.kind !== 'direct_message') return null;
  if (typeof record.entityId !== 'string' || !UUID.test(record.entityId)) return null;
  if (typeof record.tenantId !== 'string' || !UUID.test(record.tenantId)) return null;
  const pathname =
    record.kind === 'announcement'
      ? `/student/communications/announcements/${record.entityId}`
      : `/student/communications/messages/${record.entityId}`;
  return { tenantId: record.tenantId, pathname };
}

export function canOpenNotification(
  membershipTenantIds: readonly string[],
  tenantId: string,
): boolean {
  return membershipTenantIds.includes(tenantId);
}
