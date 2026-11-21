import { fetchJson, type ApiRequestContext } from '@/lib/api-client';

export interface AnnouncementItem {
  id: string;
  title: string;
  body: string;
  status: 'draft' | 'published' | 'archived';
  publishedAt: string | null;
  archivedAt: string | null;
  createdAt: string | null;
  authorUserId: string;
  authorName: string;
  tenantId: string;
  readAt: string | null;
}

export interface DirectMessageItem {
  id: string;
  body: string;
  createdAt: string | null;
  readAt: string | null;
  senderName: string;
  recipientName: string;
  recipientMembershipId: string;
  tenantId: string;
}

export interface UnreadCounts {
  announcements: number;
  messages: number;
  total: number;
}

export function listAnnouncements(ctx: ApiRequestContext) {
  return fetchJson<{ announcements: AnnouncementItem[] }>(ctx, '/v1/communications/announcements');
}

export function getAnnouncement(ctx: ApiRequestContext, id: string) {
  return fetchJson<{ announcement: AnnouncementItem }>(
    ctx,
    `/v1/communications/announcements/${id}`,
  );
}

export function createAnnouncement(ctx: ApiRequestContext, input: { title: string; body: string }) {
  return fetchJson<{ id: string; status: string }>(ctx, '/v1/communications/announcements', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateAnnouncement(
  ctx: ApiRequestContext,
  id: string,
  input: { title: string; body: string },
) {
  return fetchJson<{ id: string; status: string }>(ctx, `/v1/communications/announcements/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function publishAnnouncement(ctx: ApiRequestContext, id: string) {
  return fetchJson<{ id: string; status: string }>(
    ctx,
    `/v1/communications/announcements/${id}/publish`,
    { method: 'POST' },
  );
}

export function archiveAnnouncement(ctx: ApiRequestContext, id: string) {
  return fetchJson<{ id: string; status: string }>(
    ctx,
    `/v1/communications/announcements/${id}/archive`,
    { method: 'POST' },
  );
}

export function markAnnouncementRead(ctx: ApiRequestContext, id: string) {
  return fetchJson<{ id: string; readAt: string }>(
    ctx,
    `/v1/communications/announcements/${id}/read`,
    { method: 'POST' },
  );
}

export function listMessages(ctx: ApiRequestContext) {
  return fetchJson<{ messages: DirectMessageItem[] }>(ctx, '/v1/communications/messages');
}

export function getMessage(ctx: ApiRequestContext, id: string) {
  return fetchJson<{ message: DirectMessageItem }>(ctx, `/v1/communications/messages/${id}`);
}

export function sendMessage(ctx: ApiRequestContext, input: { membershipId: string; body: string }) {
  return fetchJson<{ id: string }>(ctx, '/v1/communications/messages', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function markMessageRead(ctx: ApiRequestContext, id: string) {
  return fetchJson<{ id: string; readAt: string }>(ctx, `/v1/communications/messages/${id}/read`, {
    method: 'POST',
  });
}

export function getUnread(ctx: ApiRequestContext) {
  return fetchJson<UnreadCounts>(ctx, '/v1/communications/unread');
}

export function registerPushToken(
  ctx: ApiRequestContext,
  input: { token: string; platform: 'ios' | 'android'; label?: string },
) {
  return fetchJson<{ id: string; status: string }>(ctx, '/v1/devices/push-tokens', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}
