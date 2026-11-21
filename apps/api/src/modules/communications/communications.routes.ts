import {
  AnnouncementWriteSchema,
  DirectMessageWriteSchema,
  NotificationPreferencesPatchSchema,
  RegisterPushDeviceSchema,
  RevokePushDeviceSchema,
} from '@daminatofit/contracts';
import type { RealmId } from '@daminatofit/brand';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Sql } from 'postgres';
import { z } from 'zod';
import { withTenantContext, type TenantContext } from '../../db/tenant-tx';
import type { AuthInstance } from '../auth/realms';
import { resolveAuthContext, toTenantContext, type AuthContext } from '../auth/session';
import { processNotificationQueue } from '../notifications/queue';
import type { PushAdapter } from '../notifications/push-adapter';

const IdSchema = z.string().uuid();

interface Limits {
  announcementsPerDay: number;
  messagesPerHour: number;
  messagesPerRecipientPerDay: number;
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function announcementStatus(row: {
  published_at: Date | string | null;
  archived_at: Date | string | null;
}) {
  if (row.archived_at) return 'archived' as const;
  if (row.published_at) return 'published' as const;
  return 'draft' as const;
}

function pgMessage(error: unknown): string {
  return error instanceof Error ? error.message : '';
}

async function loadAuth(
  request: Parameters<typeof resolveAuthContext>[0],
  opts: { auths: Record<RealmId, AuthInstance>; appSql: Sql },
): Promise<AuthContext | null> {
  return resolveAuthContext(request, opts.auths, opts.appSql);
}

export async function communicationsRoutes(
  app: FastifyInstance,
  opts: {
    auths: Record<RealmId, AuthInstance>;
    appSql: Sql;
    pushAdapter: PushAdapter;
    autoProcessPush: boolean;
    limits: Limits;
  },
): Promise<void> {
  async function dispatch(request: FastifyRequest) {
    if (!opts.autoProcessPush) return;
    try {
      await processNotificationQueue(opts.appSql, opts.pushAdapter, 20);
    } catch (error) {
      request.log.error(error, 'push_dispatch_failed');
    }
  }

  function contextOf(auth: AuthContext): TenantContext {
    return toTenantContext(auth);
  }

  app.get('/v1/communications/announcements', async (request, reply) => {
    const auth = await loadAuth(request, opts);
    if (!auth?.membership) return reply.code(401).send({ error: 'unauthorized' });

    const rows = await withTenantContext(opts.appSql, contextOf(auth), async (tx) => {
      return tx<
        {
          id: string;
          title: string;
          body: string;
          published_at: Date | null;
          archived_at: Date | null;
          created_at: Date;
          author_user_id: string;
          author_name: string | null;
          tenant_id: string;
          read_at: Date | null;
        }[]
      >`
        SELECT a.id, a.title, a.body, a.published_at, a.archived_at, a.created_at,
               a.author_user_id, author.display_name AS author_name, a.tenant_id,
               r.read_at
        FROM announcements a
        LEFT JOIN users author ON author.id = a.author_user_id
        LEFT JOIN announcement_reads r
          ON r.announcement_id = a.id
         AND r.membership_id = ${auth.membership!.id}
         AND ${auth.membership!.role} = 'student'
        WHERE a.tenant_id = ${auth.membership!.tenantId}
          AND (
            ${auth.membership!.role} = 'owner'
            OR (a.published_at IS NOT NULL AND a.archived_at IS NULL)
          )
        ORDER BY COALESCE(a.published_at, a.created_at) DESC
        LIMIT 50
      `;
    });

    return {
      announcements: rows.map((row) => ({
        id: row.id,
        title: row.title,
        body: row.body,
        status: announcementStatus(row),
        publishedAt: iso(row.published_at),
        archivedAt: iso(row.archived_at),
        createdAt: iso(row.created_at),
        authorUserId: row.author_user_id,
        authorName: row.author_name ?? 'Entrenador',
        tenantId: row.tenant_id,
        readAt: iso(row.read_at),
      })),
    };
  });

  app.get('/v1/communications/announcements/:id', async (request, reply) => {
    const auth = await loadAuth(request, opts);
    if (!auth?.membership) return reply.code(401).send({ error: 'unauthorized' });
    const id = IdSchema.safeParse((request.params as { id?: string }).id);
    if (!id.success) return reply.code(400).send({ error: 'invalid_id' });

    const rows = await withTenantContext(opts.appSql, contextOf(auth), async (tx) => {
      return tx<
        {
          id: string;
          title: string;
          body: string;
          published_at: Date | null;
          archived_at: Date | null;
          created_at: Date;
          author_user_id: string;
          author_name: string | null;
          tenant_id: string;
          read_at: Date | null;
        }[]
      >`
        SELECT a.id, a.title, a.body, a.published_at, a.archived_at, a.created_at,
               a.author_user_id, author.display_name AS author_name, a.tenant_id,
               r.read_at
        FROM announcements a
        LEFT JOIN users author ON author.id = a.author_user_id
        LEFT JOIN announcement_reads r
          ON r.announcement_id = a.id
         AND r.membership_id = ${auth.membership!.id}
         AND ${auth.membership!.role} = 'student'
        WHERE a.id = ${id.data}
          AND a.tenant_id = ${auth.membership!.tenantId}
          AND (
            ${auth.membership!.role} = 'owner'
            OR (a.published_at IS NOT NULL AND a.archived_at IS NULL)
          )
        LIMIT 1
      `;
    });

    const row = rows[0];
    if (!row) return reply.code(404).send({ error: 'not_found' });
    return {
      announcement: {
        id: row.id,
        title: row.title,
        body: row.body,
        status: announcementStatus(row),
        publishedAt: iso(row.published_at),
        archivedAt: iso(row.archived_at),
        createdAt: iso(row.created_at),
        authorUserId: row.author_user_id,
        authorName: row.author_name ?? 'Entrenador',
        tenantId: row.tenant_id,
        readAt: iso(row.read_at),
      },
    };
  });

  app.post(
    '/v1/communications/announcements',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const auth = await loadAuth(request, opts);
      if (!auth?.membership || auth.membership.role !== 'owner') {
        return reply.code(403).send({ error: 'forbidden' });
      }
      const parsed = AnnouncementWriteSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });

      const drafts = await withTenantContext(opts.appSql, contextOf(auth), async (tx) => {
        return tx<{ n: number }[]>`
          SELECT count(*)::int AS n
          FROM announcements
          WHERE tenant_id = ${auth.membership!.tenantId}
            AND published_at IS NULL
            AND archived_at IS NULL
        `;
      });
      if (Number(drafts[0]?.n ?? 0) >= 30) {
        return reply.code(429).send({ error: 'rate_limited' });
      }

      const created = await withTenantContext(opts.appSql, contextOf(auth), async (tx) => {
        return tx<{ id: string }[]>`
          INSERT INTO announcements (tenant_id, author_user_id, title, body)
          VALUES (
            ${auth.membership!.tenantId},
            ${auth.domainUser.id},
            ${parsed.data.title},
            ${parsed.data.body}
          )
          RETURNING id
        `;
      });

      return reply.code(201).send({ id: created[0]?.id, status: 'draft' });
    },
  );

  app.patch('/v1/communications/announcements/:id', async (request, reply) => {
    const auth = await loadAuth(request, opts);
    if (!auth?.membership || auth.membership.role !== 'owner') {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const id = IdSchema.safeParse((request.params as { id?: string }).id);
    if (!id.success) return reply.code(400).send({ error: 'invalid_id' });
    const parsed = AnnouncementWriteSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });

    const updated = await withTenantContext(opts.appSql, contextOf(auth), async (tx) => {
      return tx<{ id: string }[]>`
        UPDATE announcements
        SET title = ${parsed.data.title}, body = ${parsed.data.body}
        WHERE id = ${id.data}
          AND tenant_id = ${auth.membership!.tenantId}
          AND published_at IS NULL
          AND archived_at IS NULL
        RETURNING id
      `;
    });
    if (!updated[0]) return reply.code(409).send({ error: 'conflict' });
    return { id: updated[0].id, status: 'draft' };
  });

  app.post(
    '/v1/communications/announcements/:id/publish',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const auth = await loadAuth(request, opts);
      if (!auth?.membership || auth.membership.role !== 'owner') {
        return reply.code(403).send({ error: 'forbidden' });
      }
      const id = IdSchema.safeParse((request.params as { id?: string }).id);
      if (!id.success) return reply.code(400).send({ error: 'invalid_id' });

      const recent = await withTenantContext(opts.appSql, contextOf(auth), async (tx) => {
        return tx<{ n: number }[]>`
          SELECT count(*)::int AS n
          FROM announcements
          WHERE tenant_id = ${auth.membership!.tenantId}
            AND published_at > now() - interval '24 hours'
        `;
      });
      if (Number(recent[0]?.n ?? 0) >= opts.limits.announcementsPerDay) {
        return reply.code(429).send({ error: 'rate_limited' });
      }

      const published = await withTenantContext(opts.appSql, contextOf(auth), async (tx) => {
        const updated = await tx<{ id: string }[]>`
          UPDATE announcements
          SET published_at = now()
          WHERE id = ${id.data}
            AND tenant_id = ${auth.membership!.tenantId}
            AND published_at IS NULL
            AND archived_at IS NULL
          RETURNING id
        `;
        if (!updated[0]) return null;
        await tx`
          SELECT app.enqueue_communication_notifications(
            'announcement',
            ${id.data}::uuid,
            ${null}::uuid
          )
        `;
        return updated[0];
      });

      if (!published) return reply.code(409).send({ error: 'conflict' });
      await dispatch(request);
      return { id: published.id, status: 'published' };
    },
  );

  app.post('/v1/communications/announcements/:id/archive', async (request, reply) => {
    const auth = await loadAuth(request, opts);
    if (!auth?.membership || auth.membership.role !== 'owner') {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const id = IdSchema.safeParse((request.params as { id?: string }).id);
    if (!id.success) return reply.code(400).send({ error: 'invalid_id' });

    const archived = await withTenantContext(opts.appSql, contextOf(auth), async (tx) => {
      return tx<{ id: string }[]>`
        UPDATE announcements
        SET archived_at = now()
        WHERE id = ${id.data}
          AND tenant_id = ${auth.membership!.tenantId}
          AND archived_at IS NULL
        RETURNING id
      `;
    });
    if (!archived[0]) return reply.code(404).send({ error: 'not_found' });
    return { id: archived[0].id, status: 'archived' };
  });

  app.post('/v1/communications/announcements/:id/read', async (request, reply) => {
    const auth = await loadAuth(request, opts);
    if (!auth?.membership || auth.membership.role !== 'student') {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const id = IdSchema.safeParse((request.params as { id?: string }).id);
    if (!id.success) return reply.code(400).send({ error: 'invalid_id' });

    const readAt = await withTenantContext(opts.appSql, contextOf(auth), async (tx) => {
      const visible = await tx<{ id: string }[]>`
          SELECT id FROM announcements
          WHERE id = ${id.data}
            AND published_at IS NOT NULL
            AND archived_at IS NULL
          LIMIT 1
        `;
      if (!visible[0]) return null;
      const inserted = await tx<{ read_at: Date }[]>`
          INSERT INTO announcement_reads (announcement_id, membership_id)
          VALUES (${id.data}, ${auth.membership!.id})
          ON CONFLICT (announcement_id, membership_id) DO NOTHING
          RETURNING read_at
        `;
      if (inserted[0]) return inserted[0].read_at;
      const existing = await tx<{ read_at: Date }[]>`
          SELECT read_at FROM announcement_reads
          WHERE announcement_id = ${id.data}
            AND membership_id = ${auth.membership!.id}
        `;
      return existing[0]?.read_at ?? null;
    });

    if (!readAt) return reply.code(404).send({ error: 'not_found' });
    return { id: id.data, readAt: iso(readAt) };
  });

  app.get('/v1/communications/messages', async (request, reply) => {
    const auth = await loadAuth(request, opts);
    if (!auth?.membership) return reply.code(401).send({ error: 'unauthorized' });

    const rows = await withTenantContext(opts.appSql, contextOf(auth), async (tx) => {
      return tx<
        {
          id: string;
          body: string;
          created_at: Date;
          read_at: Date | null;
          sender_name: string | null;
          recipient_name: string | null;
          recipient_membership_id: string;
          tenant_id: string;
        }[]
      >`
        SELECT m.id, m.body, m.created_at, m.read_at,
               sender.display_name AS sender_name,
               recipient.display_name AS recipient_name,
               m.recipient_membership_id, m.tenant_id
        FROM direct_messages m
        LEFT JOIN users sender ON sender.id = m.sender_user_id
        LEFT JOIN memberships rm ON rm.id = m.recipient_membership_id
        LEFT JOIN users recipient ON recipient.id = rm.user_id
        WHERE m.tenant_id = ${auth.membership!.tenantId}
        ORDER BY m.created_at DESC
        LIMIT 50
      `;
    });

    return {
      messages: rows.map((row) => ({
        id: row.id,
        body: row.body,
        createdAt: iso(row.created_at),
        readAt: iso(row.read_at),
        senderName: row.sender_name ?? 'Entrenador',
        recipientName: row.recipient_name ?? 'Alumno',
        recipientMembershipId: row.recipient_membership_id,
        tenantId: row.tenant_id,
      })),
    };
  });

  app.get('/v1/communications/messages/:id', async (request, reply) => {
    const auth = await loadAuth(request, opts);
    if (!auth?.membership) return reply.code(401).send({ error: 'unauthorized' });
    const id = IdSchema.safeParse((request.params as { id?: string }).id);
    if (!id.success) return reply.code(400).send({ error: 'invalid_id' });

    const rows = await withTenantContext(opts.appSql, contextOf(auth), async (tx) => {
      return tx<
        {
          id: string;
          body: string;
          created_at: Date;
          read_at: Date | null;
          sender_name: string | null;
          recipient_name: string | null;
          recipient_membership_id: string;
          tenant_id: string;
        }[]
      >`
        SELECT m.id, m.body, m.created_at, m.read_at,
               sender.display_name AS sender_name,
               recipient.display_name AS recipient_name,
               m.recipient_membership_id, m.tenant_id
        FROM direct_messages m
        LEFT JOIN users sender ON sender.id = m.sender_user_id
        LEFT JOIN memberships rm ON rm.id = m.recipient_membership_id
        LEFT JOIN users recipient ON recipient.id = rm.user_id
        WHERE m.id = ${id.data}
          AND m.tenant_id = ${auth.membership!.tenantId}
        LIMIT 1
      `;
    });
    const row = rows[0];
    if (!row) return reply.code(404).send({ error: 'not_found' });
    return {
      message: {
        id: row.id,
        body: row.body,
        createdAt: iso(row.created_at),
        readAt: iso(row.read_at),
        senderName: row.sender_name ?? 'Entrenador',
        recipientName: row.recipient_name ?? 'Alumno',
        recipientMembershipId: row.recipient_membership_id,
        tenantId: row.tenant_id,
      },
    };
  });

  app.post(
    '/v1/communications/messages',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const auth = await loadAuth(request, opts);
      if (!auth?.membership || auth.membership.role !== 'owner') {
        return reply.code(403).send({ error: 'forbidden' });
      }
      const parsed = DirectMessageWriteSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });

      try {
        const created = await withTenantContext(opts.appSql, contextOf(auth), async (tx) => {
          const recipient = await tx<{ id: string }[]>`
            SELECT id FROM memberships
            WHERE id = ${parsed.data.membershipId}
              AND tenant_id = ${auth.membership!.tenantId}
              AND role = 'student'
              AND status = 'active'
            LIMIT 1
          `;
          if (!recipient[0]) return { error: 'recipient_not_found' as const };

          const hourly = await tx<{ n: number }[]>`
            SELECT count(*)::int AS n FROM direct_messages
            WHERE tenant_id = ${auth.membership!.tenantId}
              AND created_at > now() - interval '1 hour'
          `;
          if (Number(hourly[0]?.n ?? 0) >= opts.limits.messagesPerHour) {
            return { error: 'rate_limited' as const };
          }
          const daily = await tx<{ n: number }[]>`
            SELECT count(*)::int AS n FROM direct_messages
            WHERE recipient_membership_id = ${parsed.data.membershipId}
              AND created_at > now() - interval '24 hours'
          `;
          if (Number(daily[0]?.n ?? 0) >= opts.limits.messagesPerRecipientPerDay) {
            return { error: 'rate_limited' as const };
          }

          const inserted = await tx<{ id: string }[]>`
            INSERT INTO direct_messages (tenant_id, sender_user_id, recipient_membership_id, body)
            VALUES (
              ${auth.membership!.tenantId},
              ${auth.domainUser.id},
              ${parsed.data.membershipId},
              ${parsed.data.body}
            )
            RETURNING id
          `;
          const messageId = inserted[0]?.id;
          if (!messageId) return { error: 'recipient_not_found' as const };
          await tx`
            SELECT app.enqueue_communication_notifications(
              'direct_message',
              ${messageId}::uuid,
              ${parsed.data.membershipId}::uuid
            )
          `;
          return { id: messageId };
        });

        if ('error' in created) {
          const status = created.error === 'rate_limited' ? 429 : 404;
          return reply.code(status).send({ error: created.error });
        }
        await dispatch(request);
        return reply.code(201).send({ id: created.id });
      } catch (error) {
        request.log.error(error);
        return reply.code(400).send({ error: 'invalid_body' });
      }
    },
  );

  app.post('/v1/communications/messages/:id/read', async (request, reply) => {
    const auth = await loadAuth(request, opts);
    if (!auth?.membership || auth.membership.role !== 'student') {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const id = IdSchema.safeParse((request.params as { id?: string }).id);
    if (!id.success) return reply.code(400).send({ error: 'invalid_id' });

    const rows = await withTenantContext(opts.appSql, contextOf(auth), async (tx) => {
      return tx<{ read_at: Date }[]>`
        UPDATE direct_messages
        SET read_at = COALESCE(read_at, now())
        WHERE id = ${id.data}
        RETURNING read_at
      `;
    });
    if (!rows[0]) return reply.code(404).send({ error: 'not_found' });
    return { id: id.data, readAt: iso(rows[0].read_at) };
  });

  app.get('/v1/communications/unread', async (request, reply) => {
    const auth = await loadAuth(request, opts);
    if (!auth?.membership) return reply.code(401).send({ error: 'unauthorized' });
    if (auth.membership.role !== 'student') {
      return { announcements: 0, messages: 0, total: 0 };
    }

    const rows = await withTenantContext(opts.appSql, contextOf(auth), async (tx) => {
      return tx<{ announcements: number; messages: number }[]>`
        SELECT
          (
            SELECT count(*)::int FROM announcements a
            WHERE a.tenant_id = ${auth.membership!.tenantId}
              AND a.published_at IS NOT NULL
              AND a.archived_at IS NULL
              AND NOT EXISTS (
                SELECT 1 FROM announcement_reads r
                WHERE r.announcement_id = a.id
                  AND r.membership_id = ${auth.membership!.id}
              )
          ) AS announcements,
          (
            SELECT count(*)::int FROM direct_messages d
            WHERE d.recipient_membership_id = ${auth.membership!.id}
              AND d.read_at IS NULL
          ) AS messages
      `;
    });
    const announcements = Number(rows[0]?.announcements ?? 0);
    const messages = Number(rows[0]?.messages ?? 0);
    return { announcements, messages, total: announcements + messages };
  });

  app.get('/v1/devices/push-tokens', async (request, reply) => {
    const auth = await loadAuth(request, opts);
    if (!auth) return reply.code(401).send({ error: 'unauthorized' });

    const rows = await withTenantContext(opts.appSql, contextOf(auth), async (tx) => {
      return tx<
        {
          id: string;
          platform: string;
          status: string;
          device_label: string | null;
          last_seen_at: Date;
        }[]
      >`
        SELECT id, platform, status, device_label, last_seen_at
        FROM push_devices
        ORDER BY last_seen_at DESC
        LIMIT 20
      `;
    });

    return {
      devices: rows.map((row) => ({
        id: row.id,
        platform: row.platform,
        status: row.status,
        label: row.device_label,
        lastSeenAt: iso(row.last_seen_at),
      })),
    };
  });

  app.put(
    '/v1/devices/push-tokens',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const auth = await loadAuth(request, opts);
      if (!auth) return reply.code(401).send({ error: 'unauthorized' });
      const parsed = RegisterPushDeviceSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });

      try {
        const rows = await withTenantContext(opts.appSql, contextOf(auth), async (tx) => {
          return tx<{ id: string }[]>`
            SELECT app.register_push_device(
              ${parsed.data.platform},
              ${parsed.data.token},
              ${parsed.data.label ?? null}
            ) AS id
          `;
        });
        return { id: rows[0]?.id, status: 'active' };
      } catch (error) {
        if (pgMessage(error).includes('invalid_push_token')) {
          return reply.code(400).send({ error: 'invalid_body' });
        }
        request.log.error(error);
        return reply.code(400).send({ error: 'invalid_body' });
      }
    },
  );

  app.delete(
    '/v1/devices/push-tokens',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const auth = await loadAuth(request, opts);
      if (!auth) return reply.code(401).send({ error: 'unauthorized' });
      const parsed = RevokePushDeviceSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });

      const rows = await withTenantContext(opts.appSql, contextOf(auth), async (tx) => {
        return tx<{ revoked: boolean }[]>`
          SELECT app.revoke_push_device(${parsed.data.token}) AS revoked
        `;
      });
      if (!rows[0]?.revoked) return reply.code(404).send({ error: 'not_found' });
      return { status: 'revoked' };
    },
  );

  app.get('/v1/notification-preferences', async (request, reply) => {
    const auth = await loadAuth(request, opts);
    if (!auth) return reply.code(401).send({ error: 'unauthorized' });

    const rows = await withTenantContext(opts.appSql, contextOf(auth), async (tx) => {
      return tx<{ push_announcements: boolean; push_direct_messages: boolean }[]>`
        SELECT push_announcements, push_direct_messages
        FROM notification_preferences
        WHERE user_id = ${auth.domainUser.id}
      `;
    });
    return {
      pushAnnouncements: rows[0]?.push_announcements ?? true,
      pushDirectMessages: rows[0]?.push_direct_messages ?? true,
    };
  });

  app.patch('/v1/notification-preferences', async (request, reply) => {
    const auth = await loadAuth(request, opts);
    if (!auth) return reply.code(401).send({ error: 'unauthorized' });
    const parsed = NotificationPreferencesPatchSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });

    const current = await withTenantContext(opts.appSql, contextOf(auth), async (tx) => {
      return tx<{ push_announcements: boolean; push_direct_messages: boolean }[]>`
        SELECT push_announcements, push_direct_messages
        FROM notification_preferences
        WHERE user_id = ${auth.domainUser.id}
      `;
    });
    const pushAnnouncements =
      parsed.data.pushAnnouncements ?? current[0]?.push_announcements ?? true;
    const pushDirectMessages =
      parsed.data.pushDirectMessages ?? current[0]?.push_direct_messages ?? true;

    const saved = await withTenantContext(opts.appSql, contextOf(auth), async (tx) => {
      return tx<{ push_announcements: boolean; push_direct_messages: boolean }[]>`
        INSERT INTO notification_preferences (user_id, push_announcements, push_direct_messages)
        VALUES (${auth.domainUser.id}, ${pushAnnouncements}, ${pushDirectMessages})
        ON CONFLICT (user_id) DO UPDATE
        SET push_announcements = EXCLUDED.push_announcements,
            push_direct_messages = EXCLUDED.push_direct_messages,
            updated_at = now()
        RETURNING push_announcements, push_direct_messages
      `;
    });

    return {
      pushAnnouncements: saved[0]?.push_announcements ?? pushAnnouncements,
      pushDirectMessages: saved[0]?.push_direct_messages ?? pushDirectMessages,
    };
  });
}
