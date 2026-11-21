import type { RealmId } from '@daminatofit/brand';
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import type { Sql } from 'postgres';
import { withTenantContext } from '../../db/tenant-tx';
import type { AuthInstance } from '../auth/realms';
import { resolveAuthContext } from '../auth/session';

interface ProgressRouteOpts extends FastifyPluginOptions {
  auths: Record<RealmId, AuthInstance>;
  appSql: Sql;
}

function ctx(auth: NonNullable<Awaited<ReturnType<typeof resolveAuthContext>>>) {
  return {
    realm: auth.realm,
    userId: auth.domainUser.id,
    tenantId: auth.membership!.tenantId,
    membershipId: auth.membership!.id,
    role: auth.membership!.role,
  };
}

async function buildProgress(sql: Sql, membershipId: string) {
  const summary = await sql<
    {
      completed_sessions: number;
      abandoned_sessions: number;
      in_progress_sessions: number;
      total_sets_completed: number;
      total_volume: string | null;
    }[]
  >`
    SELECT
      count(*) FILTER (WHERE status = 'completed')::int AS completed_sessions,
      count(*) FILTER (WHERE status = 'abandoned')::int AS abandoned_sessions,
      count(*) FILTER (WHERE status = 'in_progress')::int AS in_progress_sessions,
      (
        SELECT count(*)::int FROM workout_set_logs l
        JOIN workout_sessions s2 ON s2.id = l.session_id
        WHERE s2.student_membership_id = ${membershipId} AND l.completed = true
      ) AS total_sets_completed,
      (
        SELECT coalesce(sum(l.actual_reps * l.actual_weight_kg), 0)::text
        FROM workout_set_logs l
        JOIN workout_sessions s2 ON s2.id = l.session_id
        WHERE s2.student_membership_id = ${membershipId}
          AND l.completed = true
          AND l.actual_reps IS NOT NULL
          AND l.actual_weight_kg IS NOT NULL
      ) AS total_volume
    FROM workout_sessions
    WHERE student_membership_id = ${membershipId}
  `;

  const byExercise = await sql<
    {
      exercise_id: string;
      exercise_name: string | null;
      sessions_count: number;
      max_weight: string | null;
      max_reps: number | null;
      total_volume: string | null;
      last_logged_at: string | null;
    }[]
  >`
    SELECT
      l.exercise_id,
      max(er.name) AS exercise_name,
      count(DISTINCT l.session_id)::int AS sessions_count,
      max(l.actual_weight_kg)::text AS max_weight,
      max(l.actual_reps)::int AS max_reps,
      coalesce(sum(
        CASE
          WHEN l.completed AND l.actual_reps IS NOT NULL AND l.actual_weight_kg IS NOT NULL
          THEN l.actual_reps * l.actual_weight_kg
          ELSE 0
        END
      ), 0)::text AS total_volume,
      max(l.logged_at)::text AS last_logged_at
    FROM workout_set_logs l
    JOIN workout_sessions s ON s.id = l.session_id
    LEFT JOIN exercises e ON e.id = l.exercise_id
    LEFT JOIN exercise_revisions er ON er.id = e.current_revision_id
    WHERE s.student_membership_id = ${membershipId}
      AND l.completed = true
    GROUP BY l.exercise_id
    ORDER BY max(l.logged_at) DESC NULLS LAST
  `;

  const weightSeries = await sql<
    {
      exercise_id: string;
      logged_at: string;
      actual_weight_kg: string | null;
      actual_reps: number | null;
      session_id: string;
    }[]
  >`
    SELECT l.exercise_id, l.logged_at::text, l.actual_weight_kg::text, l.actual_reps, l.session_id
    FROM workout_set_logs l
    JOIN workout_sessions s ON s.id = l.session_id
    WHERE s.student_membership_id = ${membershipId}
      AND l.completed = true
      AND l.actual_weight_kg IS NOT NULL
    ORDER BY l.logged_at ASC
    LIMIT 500
  `;

  const comparison = await sql<
    {
      session_id: string;
      started_at: string;
      day_name: string | null;
      prescribed_sets: number;
      completed_sets: number;
      matched_prescription: number;
    }[]
  >`
    SELECT
      s.id AS session_id,
      s.started_at::text,
      d.name AS day_name,
      count(l.*)::int AS prescribed_sets,
      count(l.*) FILTER (WHERE l.completed)::int AS completed_sets,
      count(l.*) FILTER (
        WHERE l.completed
          AND l.actual_reps IS NOT NULL
          AND l.prescribed_reps_min IS NOT NULL
          AND l.actual_reps BETWEEN l.prescribed_reps_min AND coalesce(l.prescribed_reps_max, l.prescribed_reps_min)
      )::int AS matched_prescription
    FROM workout_sessions s
    LEFT JOIN routine_version_days d ON d.id = s.routine_version_day_id
    LEFT JOIN workout_set_logs l ON l.session_id = s.id
    WHERE s.student_membership_id = ${membershipId}
      AND s.status IN ('completed', 'abandoned')
    GROUP BY s.id, s.started_at, d.name
    ORDER BY s.started_at DESC
    LIMIT 30
  `;

  const s = summary[0];
  return {
    summary: {
      completedSessions: s?.completed_sessions ?? 0,
      abandonedSessions: s?.abandoned_sessions ?? 0,
      inProgressSessions: s?.in_progress_sessions ?? 0,
      totalSetsCompleted: s?.total_sets_completed ?? 0,
      totalVolumeKg: s?.total_volume === null ? 0 : Number(s?.total_volume ?? 0),
    },
    exercises: byExercise.map((e) => ({
      exerciseId: e.exercise_id,
      exerciseName: e.exercise_name,
      sessionsCount: e.sessions_count,
      maxWeightKg: e.max_weight === null ? null : Number(e.max_weight),
      maxReps: e.max_reps,
      totalVolumeKg: e.total_volume === null ? 0 : Number(e.total_volume),
      lastLoggedAt: e.last_logged_at,
    })),
    weightHistory: weightSeries.map((w) => ({
      exerciseId: w.exercise_id,
      loggedAt: w.logged_at,
      weightKg: w.actual_weight_kg === null ? null : Number(w.actual_weight_kg),
      reps: w.actual_reps,
      sessionId: w.session_id,
    })),
    sessionCompliance: comparison.map((c) => ({
      sessionId: c.session_id,
      startedAt: c.started_at,
      dayName: c.day_name,
      prescribedSets: c.prescribed_sets,
      completedSets: c.completed_sets,
      matchedPrescription: c.matched_prescription,
    })),
  };
}

export async function progressRoutes(app: FastifyInstance, opts: ProgressRouteOpts) {
  app.get('/v1/student/progress', async (request, reply) => {
    const auth = await resolveAuthContext(request, opts.auths, opts.appSql);
    if (!auth?.membership || auth.membership.role !== 'student') {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const progress = await withTenantContext(opts.appSql, ctx(auth), async (tx) =>
      buildProgress(tx, auth.membership!.id),
    );
    return { progress };
  });

  app.get('/v1/trainer/students/:membershipId/progress', async (request, reply) => {
    const auth = await resolveAuthContext(request, opts.auths, opts.appSql);
    if (!auth?.membership || auth.membership.role !== 'owner') {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const membershipId = (request.params as { membershipId: string }).membershipId;

    const progress = await withTenantContext(opts.appSql, ctx(auth), async (tx) => {
      const ok = await tx<{ n: number }[]>`
        SELECT count(*)::int AS n FROM memberships
        WHERE id = ${membershipId}
          AND tenant_id = ${auth.membership!.tenantId}
          AND role = 'student'
      `;
      if ((ok[0]?.n ?? 0) === 0) return null;
      return buildProgress(tx, membershipId);
    });

    if (!progress) return reply.code(404).send({ error: 'not_found' });
    return { progress };
  });
}
