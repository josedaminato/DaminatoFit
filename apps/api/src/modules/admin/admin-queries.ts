import {
  DEFAULT_COMMERCIAL_RULE,
  estimateMonthlyCents,
  type AdminPeriod,
} from '@daminatofit/contracts';
import type { Sql } from 'postgres';

const DAMINATO = 'daminatofit';

function asIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

export function periodStartUtc(period: AdminPeriod, now = new Date()): Date {
  const start = new Date(now);
  if (period === '7d') start.setUTCDate(start.getUTCDate() - 7);
  else if (period === '30d') start.setUTCDate(start.getUTCDate() - 30);
  else if (period === '90d') start.setUTCDate(start.getUTCDate() - 90);
  else start.setUTCFullYear(start.getUTCFullYear() - 1);
  return start;
}

export async function loadCurrentCommercialRule(sql: Sql) {
  const rows = await sql<
    {
      version: number;
      currency: string;
      price_cents_per_billable_student: number;
      monthly_cap_cents: number;
      billable_basis: string;
      note: string;
      effective_from: Date;
    }[]
  >`
    SELECT version, currency, price_cents_per_billable_student, monthly_cap_cents,
           billable_basis, note, effective_from
    FROM commercial_rule_versions
    ORDER BY version DESC
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) {
    return {
      version: DEFAULT_COMMERCIAL_RULE.version,
      currency: DEFAULT_COMMERCIAL_RULE.currency,
      priceCentsPerBillableStudent: DEFAULT_COMMERCIAL_RULE.priceCentsPerBillableStudent,
      monthlyCapCents: DEFAULT_COMMERCIAL_RULE.monthlyCapCents,
      billableBasis: DEFAULT_COMMERCIAL_RULE.billableBasis,
      note: 'fallback',
      effectiveFrom: new Date(0).toISOString(),
    };
  }
  return {
    version: row.version,
    currency: row.currency as 'USD',
    priceCentsPerBillableStudent: row.price_cents_per_billable_student,
    monthlyCapCents: row.monthly_cap_cents,
    billableBasis: row.billable_basis,
    note: row.note,
    effectiveFrom: asIso(row.effective_from) ?? new Date(0).toISOString(),
  };
}

export async function dashboardSummary(sql: Sql) {
  const rule = await loadCurrentCommercialRule(sql);
  const now = new Date();
  const d7 = periodStartUtc('7d', now).toISOString();
  const d30 = periodStartUtc('30d', now).toISOString();

  const [trainers] = await sql<
    {
      total: number;
      active: number;
      paused: number;
      archived: number;
      new_7d: number;
      new_30d: number;
    }[]
  >`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE t.status = 'active')::int AS active,
      count(*) FILTER (WHERE t.status = 'paused')::int AS paused,
      count(*) FILTER (WHERE t.status = 'archived')::int AS archived,
      count(*) FILTER (WHERE t.created_at >= ${d7})::int AS new_7d,
      count(*) FILTER (WHERE t.created_at >= ${d30})::int AS new_30d
    FROM tenants t
    JOIN brands b ON b.id = t.brand_id
    WHERE b.slug = ${DAMINATO}
  `;

  const [students] = await sql<
    {
      unique_students: number;
      memberships_active: number;
      memberships_inactive: number;
      new_memberships_7d: number;
      new_memberships_30d: number;
    }[]
  >`
    SELECT
      count(DISTINCT m.user_id) FILTER (WHERE m.role = 'student')::int AS unique_students,
      count(*) FILTER (WHERE m.role = 'student' AND m.status = 'active')::int AS memberships_active,
      count(*) FILTER (WHERE m.role = 'student' AND m.status <> 'active')::int AS memberships_inactive,
      count(*) FILTER (WHERE m.role = 'student' AND m.created_at >= ${d7})::int AS new_memberships_7d,
      count(*) FILTER (WHERE m.role = 'student' AND m.created_at >= ${d30})::int AS new_memberships_30d
    FROM memberships m
    JOIN tenants t ON t.id = m.tenant_id
    JOIN brands b ON b.id = t.brand_id
    WHERE b.slug = ${DAMINATO}
  `;

  const [activity] = await sql<
    {
      routines_created: number;
      routines_assigned: number;
      sessions_completed: number;
      sessions_in_progress: number;
      sessions_abandoned: number;
      trainers_recent_activity: number;
    }[]
  >`
    SELECT
      (SELECT count(*)::int FROM routine_plans rp
         JOIN tenants t ON t.id = rp.tenant_id
         JOIN brands b ON b.id = t.brand_id WHERE b.slug = ${DAMINATO}) AS routines_created,
      (SELECT count(*)::int FROM routine_plans rp
         JOIN tenants t ON t.id = rp.tenant_id
         JOIN brands b ON b.id = t.brand_id
         WHERE b.slug = ${DAMINATO} AND rp.kind = 'assigned') AS routines_assigned,
      (SELECT count(*)::int FROM workout_sessions ws
         JOIN tenants t ON t.id = ws.tenant_id
         JOIN brands b ON b.id = t.brand_id
         WHERE b.slug = ${DAMINATO} AND ws.status = 'completed') AS sessions_completed,
      (SELECT count(*)::int FROM workout_sessions ws
         JOIN tenants t ON t.id = ws.tenant_id
         JOIN brands b ON b.id = t.brand_id
         WHERE b.slug = ${DAMINATO} AND ws.status = 'in_progress') AS sessions_in_progress,
      (SELECT count(*)::int FROM workout_sessions ws
         JOIN tenants t ON t.id = ws.tenant_id
         JOIN brands b ON b.id = t.brand_id
         WHERE b.slug = ${DAMINATO} AND ws.status = 'abandoned') AS sessions_abandoned,
      (SELECT count(DISTINCT t.id)::int FROM tenants t
         JOIN brands b ON b.id = t.brand_id
         WHERE b.slug = ${DAMINATO} AND t.status = 'active'
           AND (
             EXISTS (SELECT 1 FROM workout_sessions ws WHERE ws.tenant_id = t.id AND ws.updated_at >= ${d30})
             OR EXISTS (SELECT 1 FROM announcements a WHERE a.tenant_id = t.id AND a.created_at >= ${d30})
             OR EXISTS (SELECT 1 FROM direct_messages dm WHERE dm.tenant_id = t.id AND dm.created_at >= ${d30})
             OR EXISTS (SELECT 1 FROM routine_plans rp WHERE rp.tenant_id = t.id AND rp.updated_at >= ${d30})
           )
      ) AS trainers_recent_activity
  `;

  const [resources] = await sql<
    {
      video_count: number;
      logo_count: number;
      storage_bytes: number;
      media_bytes: number;
    }[]
  >`
    SELECT
      (SELECT count(*)::int FROM media_assets ma
         JOIN tenants t ON t.id = ma.tenant_id
         JOIN brands b ON b.id = t.brand_id
         WHERE b.slug = ${DAMINATO} AND ma.kind = 'video' AND ma.status = 'ready') AS video_count,
      (SELECT count(*)::int FROM tenants t
         JOIN brands b ON b.id = t.brand_id
         WHERE b.slug = ${DAMINATO} AND t.logo_media_id IS NOT NULL) AS logo_count,
      (SELECT COALESCE(SUM(u.storage_bytes), 0)::bigint FROM tenant_usage u
         JOIN tenants t ON t.id = u.tenant_id
         JOIN brands b ON b.id = t.brand_id
         WHERE b.slug = ${DAMINATO}) AS storage_bytes,
      (SELECT COALESCE(SUM(ma.size_bytes), 0)::bigint FROM media_assets ma
         JOIN tenants t ON t.id = ma.tenant_id
         JOIN brands b ON b.id = t.brand_id
         WHERE b.slug = ${DAMINATO} AND ma.status = 'ready') AS media_bytes
  `;

  const simRows = await sql<{ active_students: number }[]>`
    SELECT COUNT(m.id) FILTER (WHERE m.role = 'student' AND m.status = 'active')::int AS active_students
    FROM tenants t
    JOIN brands b ON b.id = t.brand_id
    LEFT JOIN memberships m ON m.tenant_id = t.id
    WHERE b.slug = ${DAMINATO} AND t.status = 'active'
    GROUP BY t.id
  `;
  let estimatedMonthlyCents = 0;
  let billableTrainers = 0;
  for (const row of simRows) {
    const estimate = estimateMonthlyCents(row.active_students, rule);
    estimatedMonthlyCents += estimate;
    if (estimate > 0) billableTrainers += 1;
  }

  return {
    scope: { brand: DAMINATO, timezone: 'UTC', dataNature: 'real' as const },
    trainers: trainers ?? {
      total: 0,
      active: 0,
      paused: 0,
      archived: 0,
      new_7d: 0,
      new_30d: 0,
    },
    students: students ?? {
      unique_students: 0,
      memberships_active: 0,
      memberships_inactive: 0,
      new_memberships_7d: 0,
      new_memberships_30d: 0,
    },
    activity: activity ?? {
      routines_created: 0,
      routines_assigned: 0,
      sessions_completed: 0,
      sessions_in_progress: 0,
      sessions_abandoned: 0,
      trainers_recent_activity: 0,
    },
    resources: {
      videoCount: Number(resources?.video_count ?? 0),
      logoCount: Number(resources?.logo_count ?? 0),
      storageBytesLogical: Number(resources?.storage_bytes ?? 0),
      storageBytesFromReadyMedia: Number(resources?.media_bytes ?? 0),
      note: 'storageBytesLogical comes from tenant_usage; storageBytesFromReadyMedia sums ready media rows once each (deduped assets are single rows).',
    },
    business: {
      potentiallyBillableTrainers: billableTrainers,
      estimatedMonthlyCents,
      estimatedMonthlyLabel: 'estimate_not_charged',
      chargedMonthlyCents: 0,
      chargedMonthlyLabel: 'not_charged',
      commercialRule: rule,
      billableBasis: rule.billableBasis,
    },
  };
}

export async function listTrainers(
  sql: Sql,
  query: {
    q?: string;
    status: string;
    page: number;
    pageSize: number;
    sort: string;
  },
  defaultQuota: number,
) {
  const rule = await loadCurrentCommercialRule(sql);
  const offset = (query.page - 1) * query.pageSize;
  const pattern = query.q ? `%${query.q.replace(/[%_]/g, '')}%` : null;
  const statusFilter = query.status === 'all' ? null : query.status;

  const rows = await sql<Record<string, unknown>[]>`
    SELECT
      t.id,
      t.name,
      t.status,
      t.created_at,
      t.owner_user_id,
      t.storage_quota_bytes,
      tp.display_name AS profile_name,
      u.display_name AS owner_name,
      au.email AS owner_email,
      COALESCE(usage.storage_bytes, 0)::bigint AS storage_bytes,
      (SELECT count(*)::int FROM memberships m
        WHERE m.tenant_id = t.id AND m.role = 'student' AND m.status = 'active') AS active_students,
      (SELECT count(*)::int FROM memberships m
        WHERE m.tenant_id = t.id AND m.role = 'student') AS memberships_total,
      (SELECT count(*)::int FROM routine_plans rp WHERE rp.tenant_id = t.id) AS routines_created,
      GREATEST(
        t.updated_at,
        COALESCE((SELECT max(ws.updated_at) FROM workout_sessions ws WHERE ws.tenant_id = t.id), t.updated_at),
        COALESCE((SELECT max(a.created_at) FROM announcements a WHERE a.tenant_id = t.id), t.updated_at),
        COALESCE((SELECT max(dm.created_at) FROM direct_messages dm WHERE dm.tenant_id = t.id), t.updated_at)
      ) AS last_activity_at
    FROM tenants t
    JOIN brands b ON b.id = t.brand_id
    JOIN users u ON u.id = t.owner_user_id
    LEFT JOIN trainer_profiles tp ON tp.tenant_id = t.id
    LEFT JOIN tenant_usage usage ON usage.tenant_id = t.id
    LEFT JOIN auth_daminatofit."user" au ON au.id = u.auth_user_id
    WHERE b.slug = ${DAMINATO}
      AND (${statusFilter}::text IS NULL OR t.status = ${statusFilter})
      AND (
        ${pattern}::text IS NULL
        OR COALESCE(tp.display_name, t.name) ILIKE ${pattern}
        OR COALESCE(au.email, '') ILIKE ${pattern}
      )
  `;

  const sorted = [...rows].sort((a, b) => {
    if (query.sort === 'created_at_asc') {
      return String(a.created_at).localeCompare(String(b.created_at));
    }
    if (query.sort === 'name_asc') {
      const an = String(a.profile_name ?? a.name ?? '');
      const bn = String(b.profile_name ?? b.name ?? '');
      return an.localeCompare(bn);
    }
    if (query.sort === 'students_desc') {
      return Number(b.active_students) - Number(a.active_students);
    }
    if (query.sort === 'storage_desc') {
      return Number(b.storage_bytes) - Number(a.storage_bytes);
    }
    return String(b.created_at).localeCompare(String(a.created_at));
  });

  const total = sorted.length;
  const pageRows = sorted.slice(offset, offset + query.pageSize);
  const items = pageRows.map((row) => {
    const activeStudents = Number(row.active_students ?? 0);
    const storageBytes = Number(row.storage_bytes ?? 0);
    const quota = Number(row.storage_quota_bytes ?? defaultQuota);
    return {
      tenantId: row.id as string,
      name: (row.profile_name as string | null) ?? (row.name as string),
      email: (row.owner_email as string | null) ?? null,
      registeredAt: asIso(row.created_at as Date | string)!,
      status: row.status as string,
      activeStudents,
      membershipsTotal: Number(row.memberships_total ?? 0),
      routinesCreated: Number(row.routines_created ?? 0),
      lastActivityAt: asIso(row.last_activity_at as Date | string)!,
      storageBytes,
      storageQuotaBytes: quota,
      storagePercent: quota > 0 ? Math.min(100, Math.round((storageBytes / quota) * 1000) / 10) : 0,
      estimatedMonthlyCents: estimateMonthlyCents(activeStudents, rule),
      estimatedMonthlyLabel: 'estimate_not_charged' as const,
    };
  });

  return { items, page: query.page, pageSize: query.pageSize, total, commercialRule: rule };
}

export async function trainerDetail(sql: Sql, tenantId: string, defaultQuota: number) {
  const detailed = await sql<Record<string, unknown>[]>`
    SELECT
      t.id, t.name, t.status, t.created_at, t.owner_user_id, t.storage_quota_bytes, t.kind,
      tp.display_name AS profile_name, tp.bio, tp.whatsapp_e164,
      u.display_name AS owner_name, au.email AS owner_email,
      COALESCE(usage.storage_bytes, 0)::bigint AS storage_bytes,
      (SELECT count(*)::int FROM memberships m WHERE m.tenant_id = t.id AND m.role = 'student' AND m.status = 'active') AS active_students,
      (SELECT count(*)::int FROM memberships m WHERE m.tenant_id = t.id AND m.role = 'student') AS memberships_total,
      (SELECT count(*)::int FROM routine_plans rp WHERE rp.tenant_id = t.id) AS routines_created,
      (SELECT count(*)::int FROM media_assets ma WHERE ma.tenant_id = t.id AND ma.kind = 'video' AND ma.status = 'ready') AS video_count,
      (SELECT count(*)::int FROM workout_sessions ws WHERE ws.tenant_id = t.id AND ws.status = 'completed') AS sessions_completed,
      (SELECT count(*)::int FROM announcements a WHERE a.tenant_id = t.id) AS announcements_count,
      (SELECT count(*)::int FROM direct_messages dm WHERE dm.tenant_id = t.id) AS messages_sent
    FROM tenants t
    JOIN brands b ON b.id = t.brand_id
    JOIN users u ON u.id = t.owner_user_id
    LEFT JOIN trainer_profiles tp ON tp.tenant_id = t.id
    LEFT JOIN tenant_usage usage ON usage.tenant_id = t.id
    LEFT JOIN auth_daminatofit."user" au ON au.id = u.auth_user_id
    WHERE t.id = ${tenantId} AND b.slug = ${DAMINATO}
  `;
  const row = detailed[0];
  if (!row) return null;
  const rule = await loadCurrentCommercialRule(sql);
  const activeStudents = Number(row.active_students ?? 0);
  const storageBytes = Number(row.storage_bytes ?? 0);
  const quota = Number(row.storage_quota_bytes ?? defaultQuota);

  const growth = await sql<{ month: string; active_students: number }[]>`
    SELECT to_char(date_trunc('month', m.created_at AT TIME ZONE 'UTC'), 'YYYY-MM') AS month,
           count(*) FILTER (WHERE m.status = 'active')::int AS active_students
    FROM memberships m
    WHERE m.tenant_id = ${tenantId} AND m.role = 'student'
    GROUP BY 1
    ORDER BY 1 ASC
  `;

  const audits = await sql<
    {
      id: string;
      action: string;
      result: string;
      reason: string | null;
      created_at: Date;
      metadata: unknown;
    }[]
  >`
    SELECT id, action, result, reason, created_at, metadata
    FROM platform_admin_audit
    WHERE resource_type = 'tenant' AND resource_id = ${tenantId}
    ORDER BY created_at DESC
    LIMIT 50
  `;

  return {
    tenantId: row.id as string,
    name: (row.profile_name as string | null) ?? (row.name as string),
    email: (row.owner_email as string | null) ?? null,
    ownerUserId: row.owner_user_id as string,
    ownerName: row.owner_name as string,
    bio: (row.bio as string | null) ?? null,
    whatsappE164: (row.whatsapp_e164 as string | null) ?? null,
    registeredAt: asIso(row.created_at as Date | string)!,
    status: row.status as string,
    kind: row.kind as string,
    activeStudents,
    membershipsTotal: Number(row.memberships_total ?? 0),
    routinesCreated: Number(row.routines_created ?? 0),
    videoCount: Number(row.video_count ?? 0),
    sessionsCompleted: Number(row.sessions_completed ?? 0),
    announcementsCount: Number(row.announcements_count ?? 0),
    messagesSent: Number(row.messages_sent ?? 0),
    storageBytes,
    storageQuotaBytes: quota,
    storagePercent: quota > 0 ? Math.min(100, Math.round((storageBytes / quota) * 1000) / 10) : 0,
    estimatedMonthlyCents: estimateMonthlyCents(activeStudents, rule),
    estimatedMonthlyLabel: 'estimate_not_charged' as const,
    chargedMonthlyCents: 0,
    studentGrowthByMonth: growth,
    adminActions: audits.map((a) => ({
      id: a.id,
      action: a.action,
      result: a.result,
      reason: a.reason,
      createdAt: asIso(a.created_at)!,
      metadata: a.metadata,
    })),
    privacyNote:
      'Private messages, workout set details and passwords are not included in this admin view.',
  };
}

export async function studentsSummary(sql: Sql) {
  const [row] = await sql<
    {
      unique_students: number;
      memberships_total: number;
      memberships_active: number;
      memberships_inactive: number;
      multi_trainer_students: number;
    }[]
  >`
    SELECT
      count(DISTINCT m.user_id) FILTER (WHERE m.role = 'student')::int AS unique_students,
      count(*) FILTER (WHERE m.role = 'student')::int AS memberships_total,
      count(*) FILTER (WHERE m.role = 'student' AND m.status = 'active')::int AS memberships_active,
      count(*) FILTER (WHERE m.role = 'student' AND m.status <> 'active')::int AS memberships_inactive,
      (
        SELECT count(*)::int FROM (
          SELECT m2.user_id
          FROM memberships m2
          JOIN tenants t2 ON t2.id = m2.tenant_id
          JOIN brands b2 ON b2.id = t2.brand_id
          WHERE b2.slug = ${DAMINATO} AND m2.role = 'student'
          GROUP BY m2.user_id
          HAVING count(*) > 1
        ) multi
      ) AS multi_trainer_students
    FROM memberships m
    JOIN tenants t ON t.id = m.tenant_id
    JOIN brands b ON b.id = t.brand_id
    WHERE b.slug = ${DAMINATO}
  `;

  return {
    scope: { brand: DAMINATO, timezone: 'UTC' },
    uniqueStudents: row?.unique_students ?? 0,
    membershipsTotal: row?.memberships_total ?? 0,
    membershipsActive: row?.memberships_active ?? 0,
    membershipsInactive: row?.memberships_inactive ?? 0,
    multiTrainerStudents: row?.multi_trainer_students ?? 0,
    billableNote:
      'Billable students are not finalized. Simulations use active student memberships and are labeled as estimates.',
    definitions: {
      uniqueStudent: 'One registered person, regardless of how many trainers they have.',
      membership: 'A student–trainer relationship.',
      activeMembership: 'A membership with status active.',
      billableStudent: 'Not definitive yet — simulation basis only.',
    },
  };
}

export async function trainerStudentsMinimal(sql: Sql, tenantId: string) {
  const ok = await sql<{ id: string }[]>`
    SELECT t.id FROM tenants t
    JOIN brands b ON b.id = t.brand_id
    WHERE t.id = ${tenantId} AND b.slug = ${DAMINATO}
  `;
  if (!ok[0]) return null;
  const rows = await sql<
    {
      membership_id: string;
      status: string;
      created_at: Date;
      display_name: string;
    }[]
  >`
    SELECT m.id AS membership_id, m.status, m.created_at, u.display_name
    FROM memberships m
    JOIN users u ON u.id = m.user_id
    WHERE m.tenant_id = ${tenantId} AND m.role = 'student'
    ORDER BY m.created_at DESC
  `;
  return rows.map((row) => ({
    membershipId: row.membership_id,
    status: row.status,
    createdAt: asIso(row.created_at)!,
    displayName: row.display_name,
  }));
}

export async function statsSeries(sql: Sql, period: AdminPeriod) {
  const startDate = periodStartUtc(period);
  const start = startDate.toISOString();
  const startDay = start.slice(0, 10);
  const snapshots = await sql<
    {
      snapshot_date: string;
      trainers_active: number;
      memberships_active: number;
      sessions_completed: number;
      storage_bytes: number;
      estimated_monthly_cents: number;
    }[]
  >`
    SELECT snapshot_date::text, trainers_active, memberships_active, sessions_completed,
           storage_bytes, estimated_monthly_cents
    FROM platform_metric_snapshots
    WHERE brand_slug = ${DAMINATO} AND snapshot_date >= ${startDay}::date
    ORDER BY snapshot_date ASC
  `;

  const newTrainers = await sql<{ bucket: string; count: number }[]>`
    SELECT to_char(date_trunc('month', t.created_at AT TIME ZONE 'UTC'), 'YYYY-MM') AS bucket,
           count(*)::int AS count
    FROM tenants t
    JOIN brands b ON b.id = t.brand_id
    WHERE b.slug = ${DAMINATO} AND t.created_at >= ${start}
    GROUP BY 1 ORDER BY 1
  `;

  const newMemberships = await sql<{ bucket: string; count: number }[]>`
    SELECT to_char(date_trunc('month', m.created_at AT TIME ZONE 'UTC'), 'YYYY-MM') AS bucket,
           count(*)::int AS count
    FROM memberships m
    JOIN tenants t ON t.id = m.tenant_id
    JOIN brands b ON b.id = t.brand_id
    WHERE b.slug = ${DAMINATO} AND m.role = 'student' AND m.created_at >= ${start}
    GROUP BY 1 ORDER BY 1
  `;

  const completed = await sql<{ bucket: string; count: number }[]>`
    SELECT to_char(date_trunc('month', ws.finished_at AT TIME ZONE 'UTC'), 'YYYY-MM') AS bucket,
           count(*)::int AS count
    FROM workout_sessions ws
    JOIN tenants t ON t.id = ws.tenant_id
    JOIN brands b ON b.id = t.brand_id
    WHERE b.slug = ${DAMINATO}
      AND ws.status = 'completed'
      AND ws.finished_at IS NOT NULL
      AND ws.finished_at >= ${start}
    GROUP BY 1 ORDER BY 1
  `;

  return {
    scope: { brand: DAMINATO, timezone: 'UTC', period, periodStart: start },
    snapshots: {
      available: snapshots.length > 0,
      note: snapshots.length
        ? 'Daily snapshots captured going forward.'
        : 'No historical snapshots yet for this window. Live period aggregates below use created_at/finished_at; they are not reconstructed day-by-day.',
      points: snapshots.map((s) => ({
        date: s.snapshot_date,
        trainersActive: s.trainers_active,
        membershipsActive: s.memberships_active,
        sessionsCompleted: s.sessions_completed,
        storageBytes: Number(s.storage_bytes),
        estimatedMonthlyCents: s.estimated_monthly_cents,
      })),
    },
    live: {
      newTrainersByMonth: newTrainers,
      newMembershipsByMonth: newMemberships,
      completedSessionsByMonth: completed,
    },
  };
}

export async function storageOverview(sql: Sql, defaultQuota: number) {
  const rows = await sql<
    {
      tenant_id: string;
      name: string;
      storage_bytes: number;
      quota: number | null;
      video_count: number;
      has_logo: boolean;
    }[]
  >`
    SELECT t.id AS tenant_id,
           COALESCE(tp.display_name, t.name) AS name,
           COALESCE(u.storage_bytes, 0)::bigint AS storage_bytes,
           t.storage_quota_bytes AS quota,
           (SELECT count(*)::int FROM media_assets ma
             WHERE ma.tenant_id = t.id AND ma.kind = 'video' AND ma.status = 'ready') AS video_count,
           (t.logo_media_id IS NOT NULL) AS has_logo
    FROM tenants t
    JOIN brands b ON b.id = t.brand_id
    LEFT JOIN trainer_profiles tp ON tp.tenant_id = t.id
    LEFT JOIN tenant_usage u ON u.tenant_id = t.id
    WHERE b.slug = ${DAMINATO}
    ORDER BY COALESCE(u.storage_bytes, 0) DESC
  `;

  const [totals] = await sql<{ logical: number; media: number }[]>`
    SELECT
      (SELECT COALESCE(SUM(u.storage_bytes), 0)::bigint
         FROM tenant_usage u
         JOIN tenants t ON t.id = u.tenant_id
         JOIN brands b ON b.id = t.brand_id WHERE b.slug = ${DAMINATO}) AS logical,
      (SELECT COALESCE(SUM(ma.size_bytes), 0)::bigint
         FROM media_assets ma
         JOIN tenants t ON t.id = ma.tenant_id
         JOIN brands b ON b.id = t.brand_id
         WHERE b.slug = ${DAMINATO} AND ma.status = 'ready') AS media
  `;

  return {
    scope: { brand: DAMINATO },
    totals: {
      storageBytesLogical: Number(totals?.logical ?? 0),
      storageBytesFromReadyMedia: Number(totals?.media ?? 0),
      videoCount: rows.reduce((sum, r) => sum + Number(r.video_count), 0),
      logoCount: rows.filter((r) => r.has_logo).length,
    },
    trainers: rows.map((r) => {
      const quota = Number(r.quota ?? defaultQuota);
      const used = Number(r.storage_bytes);
      return {
        tenantId: r.tenant_id,
        name: r.name,
        storageBytes: used,
        storageQuotaBytes: quota,
        storagePercent: quota > 0 ? Math.min(100, Math.round((used / quota) * 1000) / 10) : 0,
        videoCount: Number(r.video_count),
        hasLogo: r.has_logo,
      };
    }),
    note: 'Logical usage is tenant_usage. Ready media sum counts each stored asset once (shared references do not duplicate rows).',
  };
}

export async function billingEstimates(sql: Sql) {
  const rule = await loadCurrentCommercialRule(sql);
  const rows = await sql<{ tenant_id: string; name: string; active_students: number }[]>`
    SELECT t.id AS tenant_id,
           COALESCE(tp.display_name, t.name) AS name,
           count(m.id) FILTER (WHERE m.role = 'student' AND m.status = 'active')::int AS active_students
    FROM tenants t
    JOIN brands b ON b.id = t.brand_id
    LEFT JOIN trainer_profiles tp ON tp.tenant_id = t.id
    LEFT JOIN memberships m ON m.tenant_id = t.id
    WHERE b.slug = ${DAMINATO} AND t.status = 'active'
    GROUP BY t.id, tp.display_name, t.name
    ORDER BY active_students DESC, name ASC
  `;

  const trainers = rows.map((r) => ({
    tenantId: r.tenant_id,
    name: r.name,
    simulatedBillableStudents: r.active_students,
    estimatedMonthlyCents: estimateMonthlyCents(r.active_students, rule),
    estimatedMonthlyLabel: 'estimate_not_charged' as const,
    chargedMonthlyCents: 0,
  }));

  return {
    scope: { brand: DAMINATO },
    commercialRule: rule,
    referralPolicy: {
      documented: true,
      automaticDiscountsEnabled: false,
      note: 'Referral discounts are not applied until validation rules exist.',
    },
    totals: {
      estimatedMonthlyCents: trainers.reduce((sum, t) => sum + t.estimatedMonthlyCents, 0),
      chargedMonthlyCents: 0,
      estimatedMonthlyLabel: 'estimate_not_charged',
      chargedMonthlyLabel: 'not_charged',
    },
    trainers,
  };
}
