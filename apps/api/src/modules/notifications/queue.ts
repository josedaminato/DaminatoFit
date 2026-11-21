import { PUSH_COPY } from '@daminatofit/contracts';
import type { Sql } from 'postgres';
import { pushCopyMatches, type PushAdapter, type PushMessage } from './push-adapter';

interface ClaimRow {
  id: string;
  expo_push_token: string | null;
  payload: unknown;
  attempt_count: number;
  membership_status: string | null;
  device_status: string | null;
  push_allowed: boolean;
  user_deleted: boolean;
}

function parsePayload(value: unknown): PushMessage | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort().join(',');
  if (keys !== 'body,data,title') return null;
  if (typeof record.title !== 'string' || typeof record.body !== 'string') return null;
  if (!record.data || typeof record.data !== 'object') return null;
  const data = record.data as Record<string, unknown>;
  if (Object.keys(data).sort().join(',') !== 'entityId,kind,tenantId') return null;
  if (data.kind !== 'announcement' && data.kind !== 'direct_message') return null;
  if (typeof data.entityId !== 'string' || typeof data.tenantId !== 'string') return null;
  const message: PushMessage = {
    to: '',
    title: record.title,
    body: record.body,
    data: { kind: data.kind, entityId: data.entityId, tenantId: data.tenantId },
  };
  if (!pushCopyMatches(message)) return null;
  const expected = PUSH_COPY[message.data.kind];
  if (message.title !== expected.title || message.body !== expected.body) return null;
  return message;
}

function skipReason(row: ClaimRow, payload: PushMessage | null): string | null {
  if (!payload) return 'invalid_payload';
  if (row.user_deleted) return 'account_inactive';
  if (row.membership_status !== 'active') return 'membership_inactive';
  if (!row.push_allowed) return 'preference_disabled';
  if (row.device_status !== 'active' || !row.expo_push_token) return 'device_inactive';
  return null;
}

async function complete(
  sql: Sql,
  id: string,
  status: 'sent' | 'failed' | 'skipped' | 'invalid_token',
  error: string | null,
  ticket: string | null,
): Promise<void> {
  await sql`SELECT app.complete_notification_delivery(${id}::uuid, ${status}, ${error}, ${ticket})`;
}

/**
 * Claims a small batch and talks to the push adapter.
 * A failed send leaves the announcement or message stored; only the delivery row changes.
 * `sent` with a `mock-` ticket means the local adapter accepted the payload, not a phone.
 */
export async function processNotificationQueue(
  sql: Sql,
  adapter: PushAdapter,
  limit = 20,
): Promise<{ claimed: number; sent: number }> {
  const rows = await sql<ClaimRow[]>`
    SELECT * FROM app.claim_notification_deliveries(${limit})
  `;

  let sent = 0;
  for (const row of rows) {
    const payload = parsePayload(row.payload);
    const reason = skipReason(row, payload);
    if (reason || !payload || !row.expo_push_token) {
      await complete(sql, row.id, 'skipped', reason ?? 'invalid_payload', null);
      continue;
    }

    try {
      const result = await adapter.send({ ...payload, to: row.expo_push_token });
      if (result.ok) {
        sent += 1;
        await complete(sql, row.id, 'sent', null, result.ticketId);
      } else if (result.error === 'invalid_token') {
        await complete(sql, row.id, 'invalid_token', result.message, null);
      } else {
        await complete(sql, row.id, 'failed', result.message, null);
      }
    } catch {
      await complete(sql, row.id, 'failed', 'adapter_threw', null);
    }
  }

  return { claimed: rows.length, sent };
}
