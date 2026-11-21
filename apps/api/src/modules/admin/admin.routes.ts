import {
  AdminAuditQuerySchema,
  AdminCommercialRuleWriteSchema,
  AdminPeriodQuerySchema,
  AdminSetTenantStatusSchema,
  AdminTrainerListQuerySchema,
  REFERRAL_POLICY,
} from '@daminatofit/contracts';
import type { FastifyPluginAsync } from 'fastify';
import type { Sql } from 'postgres';
import type { Env } from '../../config/env';
import type { AuthInstance } from '../auth/realms';
import { recordAdminAudit, requirePlatformAdmin } from './admin-auth';
import {
  billingEstimates,
  dashboardSummary,
  listTrainers,
  loadCurrentCommercialRule,
  statsSeries,
  storageOverview,
  studentsSummary,
  trainerDetail,
  trainerStudentsMinimal,
} from './admin-queries';

interface AdminRouteOpts {
  auths: Record<string, AuthInstance>;
  appSql: Sql;
  migratorSql: Sql;
  env: Env;
}

export const adminRoutes: FastifyPluginAsync<AdminRouteOpts> = async (app, opts) => {
  const gate = async (
    request: Parameters<typeof requirePlatformAdmin>[0],
    reply: Parameters<typeof requirePlatformAdmin>[1],
  ) => requirePlatformAdmin(request, reply, opts.auths, opts.appSql, opts.migratorSql);

  app.get(
    '/v1/admin/me',
    {
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const auth = await gate(request, reply);
      if (!auth) return;

      await recordAdminAudit(opts.migratorSql, {
        actorUserId: auth.domainUser.id,
        action: 'admin.session',
        resourceType: 'admin_api',
        result: 'success',
        metadata: { path: '/v1/admin/me' },
      });

      return {
        user: {
          id: auth.domainUser.id,
          displayName: auth.domainUser.displayName,
          email: auth.email,
          platformRole: auth.domainUser.platformRole,
        },
        mfa: {
          enabled: false,
          requiredBeforeInternetExposure: true,
          note: 'TOTP/MFA is not implemented in Phase 7. Do not expose this panel on the public internet until MFA is enforced.',
        },
        scope: { brand: 'daminatofit', excludes: ['pupiapp'] },
      };
    },
  );

  app.get('/v1/admin/dashboard', async (request, reply) => {
    const auth = await gate(request, reply);
    if (!auth) return;
    return dashboardSummary(opts.migratorSql);
  });

  app.get('/v1/admin/trainers', async (request, reply) => {
    const auth = await gate(request, reply);
    if (!auth) return;
    const parsed = AdminTrainerListQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_query' });
    return listTrainers(opts.migratorSql, parsed.data, opts.env.DEFAULT_STORAGE_QUOTA_BYTES);
  });

  app.get('/v1/admin/trainers/:tenantId', async (request, reply) => {
    const auth = await gate(request, reply);
    if (!auth) return;
    const tenantId = (request.params as { tenantId: string }).tenantId;
    const detail = await trainerDetail(
      opts.migratorSql,
      tenantId,
      opts.env.DEFAULT_STORAGE_QUOTA_BYTES,
    );
    if (!detail) return reply.code(404).send({ error: 'not_found' });
    return detail;
  });

  app.get('/v1/admin/trainers/:tenantId/students', async (request, reply) => {
    const auth = await gate(request, reply);
    if (!auth) return;
    const tenantId = (request.params as { tenantId: string }).tenantId;
    const students = await trainerStudentsMinimal(opts.migratorSql, tenantId);
    if (!students) return reply.code(404).send({ error: 'not_found' });
    return { items: students };
  });

  app.post(
    '/v1/admin/trainers/:tenantId/status',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const auth = await gate(request, reply);
      if (!auth) return;
      const tenantId = (request.params as { tenantId: string }).tenantId;
      const parsed = AdminSetTenantStatusSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });

      try {
        const rows = await opts.migratorSql<
          { tenant_id: string; previous_status: string; new_status: string }[]
        >`
          SELECT * FROM app.admin_set_tenant_status(
            ${auth.domainUser.id}::uuid,
            ${tenantId}::uuid,
            ${parsed.data.status},
            ${parsed.data.reason}
          )
        `;
        const row = rows[0];
        return {
          tenantId: row?.tenant_id ?? tenantId,
          previousStatus: row?.previous_status,
          status: row?.new_status,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'status_change_failed';
        if (message.includes('platform admin required')) {
          return reply.code(403).send({ error: 'forbidden' });
        }
        if (message.includes('own trainer tenant')) {
          return reply.code(400).send({ error: 'cannot_modify_own_trainer_tenant' });
        }
        if (message.includes('daminatofit tenants only') || message.includes('tenant not found')) {
          return reply.code(404).send({ error: 'not_found' });
        }
        request.log.error({ err: error }, 'admin status change failed');
        return reply.code(400).send({ error: 'status_change_failed' });
      }
    },
  );

  app.get('/v1/admin/students/summary', async (request, reply) => {
    const auth = await gate(request, reply);
    if (!auth) return;
    return studentsSummary(opts.migratorSql);
  });

  app.get('/v1/admin/stats', async (request, reply) => {
    const auth = await gate(request, reply);
    if (!auth) return;
    const parsed = AdminPeriodQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_query' });
    return statsSeries(opts.migratorSql, parsed.data.period);
  });

  app.get('/v1/admin/storage', async (request, reply) => {
    const auth = await gate(request, reply);
    if (!auth) return;
    return storageOverview(opts.migratorSql, opts.env.DEFAULT_STORAGE_QUOTA_BYTES);
  });

  app.get('/v1/admin/billing/estimates', async (request, reply) => {
    const auth = await gate(request, reply);
    if (!auth) return;
    return billingEstimates(opts.migratorSql);
  });

  app.get('/v1/admin/config', async (request, reply) => {
    const auth = await gate(request, reply);
    if (!auth) return;
    const commercial = await loadCurrentCommercialRule(opts.migratorSql);
    return {
      commercial,
      referral: REFERRAL_POLICY,
      functional: {
        announcementsPerDay: opts.env.ANNOUNCEMENTS_PER_DAY,
        directMessagesPerHour: opts.env.DIRECT_MESSAGES_PER_HOUR,
        directMessagesPerRecipientPerDay: opts.env.DIRECT_MESSAGES_PER_RECIPIENT_PER_DAY,
        defaultStorageQuotaBytes: opts.env.DEFAULT_STORAGE_QUOTA_BYTES,
        mediaMaxBytes: opts.env.MEDIA_MAX_BYTES,
        mediaLogoMaxBytes: opts.env.MEDIA_LOGO_MAX_BYTES,
      },
      security: {
        mfaEnforced: false,
        mfaRequiredBeforeInternetExposure: true,
        secretsEditableFromUi: false,
      },
      infrastructureSecrets: {
        note: 'Secrets stay in environment variables and are not readable or editable here.',
        exposed: false,
      },
    };
  });

  app.post(
    '/v1/admin/config/commercial',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const auth = await gate(request, reply);
      if (!auth) return;
      const parsed = AdminCommercialRuleWriteSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });

      const current = await loadCurrentCommercialRule(opts.migratorSql);
      const nextVersion = current.version + 1;
      const inserted = await opts.migratorSql<
        {
          version: number;
          price_cents_per_billable_student: number;
          monthly_cap_cents: number;
        }[]
      >`
        INSERT INTO commercial_rule_versions (
          version, currency, price_cents_per_billable_student, monthly_cap_cents,
          billable_basis, note, created_by_user_id, effective_from
        ) VALUES (
          ${nextVersion},
          'USD',
          ${parsed.data.priceCentsPerBillableStudent},
          ${parsed.data.monthlyCapCents},
          'active_student_memberships_simulation',
          ${parsed.data.note},
          ${auth.domainUser.id}::uuid,
          now()
        )
        RETURNING version, price_cents_per_billable_student, monthly_cap_cents
      `;

      await recordAdminAudit(opts.migratorSql, {
        actorUserId: auth.domainUser.id,
        action: 'commercial_rule.create',
        resourceType: 'commercial_rule_version',
        resourceId: null,
        result: 'success',
        reason: parsed.data.note,
        metadata: {
          fromVersion: current.version,
          toVersion: nextVersion,
          priceCentsPerBillableStudent: parsed.data.priceCentsPerBillableStudent,
          monthlyCapCents: parsed.data.monthlyCapCents,
        },
      });

      return {
        version: inserted[0]?.version ?? nextVersion,
        priceCentsPerBillableStudent: inserted[0]?.price_cents_per_billable_student,
        monthlyCapCents: inserted[0]?.monthly_cap_cents,
        appliesRetroactively: false,
        note: 'New commercial rules apply going forward only.',
      };
    },
  );

  app.get('/v1/admin/audit', async (request, reply) => {
    const auth = await gate(request, reply);
    if (!auth) return;
    const parsed = AdminAuditQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_query' });
    const offset = (parsed.data.page - 1) * parsed.data.pageSize;
    const action = parsed.data.action ?? null;
    const rows = await opts.migratorSql<
      {
        id: string;
        actor_user_id: string | null;
        action: string;
        resource_type: string;
        resource_id: string | null;
        result: string;
        reason: string | null;
        metadata: unknown;
        created_at: Date;
        total_count: number;
      }[]
    >`
      SELECT id, actor_user_id, action, resource_type, resource_id, result, reason, metadata,
             created_at, count(*) OVER()::int AS total_count
      FROM platform_admin_audit
      WHERE (${action}::text IS NULL OR action = ${action})
      ORDER BY created_at DESC
      LIMIT ${parsed.data.pageSize} OFFSET ${offset}
    `;

    return {
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      total: rows[0]?.total_count ?? 0,
      retentionNote:
        'No mandatory retention period is defined yet. Audit rows are append-only and not editable via this API.',
      items: rows.map((row) => ({
        id: row.id,
        actorUserId: row.actor_user_id,
        action: row.action,
        resourceType: row.resource_type,
        resourceId: row.resource_id,
        result: row.result,
        reason: row.reason,
        metadata: row.metadata,
        createdAt:
          row.created_at instanceof Date
            ? row.created_at.toISOString()
            : new Date(row.created_at).toISOString(),
      })),
    };
  });

  app.post(
    '/v1/admin/snapshots/capture',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const auth = await gate(request, reply);
      if (!auth) return;
      const rows = await opts.migratorSql<{ id: string }[]>`
        SELECT app.capture_daminatofit_metric_snapshot() AS id
      `;
      await recordAdminAudit(opts.migratorSql, {
        actorUserId: auth.domainUser.id,
        action: 'snapshot.capture',
        resourceType: 'platform_metric_snapshot',
        resourceId: rows[0]?.id ?? null,
        result: 'success',
      });
      return { id: rows[0]?.id, captured: true };
    },
  );

  // Explicitly no public admin registration surface.
  app.post('/v1/admin/register', async (_request, reply) => {
    return reply.code(404).send({ error: 'not_found' });
  });
};
