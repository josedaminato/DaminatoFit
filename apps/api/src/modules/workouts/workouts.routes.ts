import type { RealmId } from '@daminatofit/brand';
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import type { Sql } from 'postgres';
import { z } from 'zod';
import { withTenantContext } from '../../db/tenant-tx';
import type { AuthInstance } from '../auth/realms';
import { resolveAuthContext } from '../auth/session';

interface WorkoutRouteOpts extends FastifyPluginOptions {
  auths: Record<RealmId, AuthInstance>;
  appSql: Sql;
  migratorSql: Sql;
}

const StartSchema = z.object({
  clientId: z.string().uuid(),
  routineVersionId: z.string().uuid(),
  routineVersionDayId: z.string().uuid(),
  startedAt: z.string().datetime().optional(),
  notes: z.string().max(2000).optional(),
});

const SetUpsertSchema = z.object({
  clientId: z.string().uuid(),
  exerciseId: z.string().uuid(),
  routineVersionSetId: z.string().uuid().nullable().optional(),
  position: z.number().int().min(0).max(100),
  prescribedRepsMin: z.number().int().min(0).max(500).nullable().optional(),
  prescribedRepsMax: z.number().int().min(0).max(500).nullable().optional(),
  prescribedWeightKg: z.number().min(0).max(2000).nullable().optional(),
  actualReps: z.number().int().min(0).max(500).nullable().optional(),
  actualWeightKg: z.number().min(0).max(2000).nullable().optional(),
  completed: z.boolean().default(false),
  notes: z.string().max(1000).optional(),
  loggedAt: z.string().datetime().optional(),
  clientUpdatedAt: z.string().datetime(),
});

const SyncSchema = z.object({
  sessions: z
    .array(
      z.object({
        clientId: z.string().uuid(),
        routineVersionId: z.string().uuid(),
        routineVersionDayId: z.string().uuid(),
        startedAt: z.string().datetime().optional(),
        notes: z.string().max(2000).optional(),
        status: z.enum(['in_progress', 'completed', 'abandoned']).optional(),
        finishedAt: z.string().datetime().nullable().optional(),
      }),
    )
    .max(20)
    .default([]),
  sets: z
    .array(
      SetUpsertSchema.extend({
        sessionClientId: z.string().uuid(),
      }),
    )
    .max(500)
    .default([]),
});

const FinishSchema = z.object({
  status: z.enum(['completed', 'abandoned']),
  finishedAt: z.string().datetime().optional(),
  notes: z.string().max(2000).optional(),
});

function studentCtx(auth: NonNullable<Awaited<ReturnType<typeof resolveAuthContext>>>) {
  return {
    realm: auth.realm,
    userId: auth.domainUser.id,
    tenantId: auth.membership!.tenantId,
    membershipId: auth.membership!.id,
    role: auth.membership!.role,
  };
}

function mapSession(row: {
  id: string;
  client_id: string;
  routine_version_id: string;
  routine_version_day_id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  notes: string;
  day_name?: string | null;
  version_number?: number | null;
  plan_name?: string | null;
}) {
  return {
    id: row.id,
    clientId: row.client_id,
    routineVersionId: row.routine_version_id,
    routineVersionDayId: row.routine_version_day_id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    status: row.status,
    notes: row.notes,
    dayName: row.day_name ?? null,
    versionNumber: row.version_number ?? null,
    planName: row.plan_name ?? null,
  };
}

function mapSet(row: {
  id: string;
  client_id: string;
  session_id: string;
  exercise_id: string;
  routine_version_set_id: string | null;
  position: number;
  prescribed_reps_min: number | null;
  prescribed_reps_max: number | null;
  prescribed_weight_kg: string | null;
  actual_reps: number | null;
  actual_weight_kg: string | null;
  completed: boolean;
  notes: string;
  logged_at: string;
  client_updated_at: string;
  exercise_name?: string | null;
}) {
  return {
    id: row.id,
    clientId: row.client_id,
    sessionId: row.session_id,
    exerciseId: row.exercise_id,
    exerciseName: row.exercise_name ?? null,
    routineVersionSetId: row.routine_version_set_id,
    position: row.position,
    prescribedRepsMin: row.prescribed_reps_min,
    prescribedRepsMax: row.prescribed_reps_max,
    prescribedWeightKg: row.prescribed_weight_kg === null ? null : Number(row.prescribed_weight_kg),
    actualReps: row.actual_reps,
    actualWeightKg: row.actual_weight_kg === null ? null : Number(row.actual_weight_kg),
    completed: row.completed,
    notes: row.notes,
    loggedAt: row.logged_at,
    clientUpdatedAt: row.client_updated_at,
  };
}

async function loadSets(sql: Sql, sessionId: string) {
  const rows = await sql<
    {
      id: string;
      client_id: string;
      session_id: string;
      exercise_id: string;
      routine_version_set_id: string | null;
      position: number;
      prescribed_reps_min: number | null;
      prescribed_reps_max: number | null;
      prescribed_weight_kg: string | null;
      actual_reps: number | null;
      actual_weight_kg: string | null;
      completed: boolean;
      notes: string;
      logged_at: string;
      client_updated_at: string;
      exercise_name: string | null;
    }[]
  >`
    SELECT l.*, er.name AS exercise_name
    FROM workout_set_logs l
    LEFT JOIN exercises e ON e.id = l.exercise_id
    LEFT JOIN exercise_revisions er ON er.id = e.current_revision_id
    WHERE l.session_id = ${sessionId}
    ORDER BY l.position, l.logged_at
  `;
  return rows.map(mapSet);
}

export async function workoutsRoutes(app: FastifyInstance, opts: WorkoutRouteOpts) {
  app.post('/v1/workouts/sessions', async (request, reply) => {
    const auth = await resolveAuthContext(request, opts.auths, opts.appSql);
    if (!auth?.membership || auth.membership.role !== 'student') {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const parsed = StartSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });

    try {
      const rows = await opts.appSql<{ start_workout_session: string }[]>`
        SELECT app.start_workout_session(
          ${auth.membership.tenantId},
          ${auth.membership.id},
          ${parsed.data.clientId},
          ${parsed.data.routineVersionId},
          ${parsed.data.routineVersionDayId},
          ${parsed.data.startedAt ?? null},
          ${parsed.data.notes ?? ''}
        )
      `;
      const sessionId = rows[0]?.start_workout_session;
      if (!sessionId) return reply.code(500).send({ error: 'start_failed' });
      const detail = await withTenantContext(opts.appSql, studentCtx(auth), async (tx) => {
        const sessions = (await tx`
          SELECT s.id, s.client_id, s.routine_version_id, s.routine_version_day_id,
                 s.started_at::text, s.finished_at::text, s.status, s.notes, d.name AS day_name
          FROM workout_sessions s
          LEFT JOIN routine_version_days d ON d.id = s.routine_version_day_id
          WHERE s.id = ${sessionId}
        `) as {
          id: string;
          client_id: string;
          routine_version_id: string;
          routine_version_day_id: string;
          started_at: string;
          finished_at: string | null;
          status: string;
          notes: string;
          day_name: string | null;
        }[];
        return sessions[0] ?? null;
      });
      if (!detail) return reply.code(500).send({ error: 'start_failed' });
      return reply.code(201).send({ session: mapSession(detail) });
    } catch (error) {
      const msg = error instanceof Error ? error.message : '';
      if (msg.includes('active_session_exists')) {
        return reply.code(409).send({ error: 'active_session_exists' });
      }
      if (msg.includes('invalid_routine_day')) {
        return reply.code(400).send({ error: 'invalid_routine_day' });
      }
      request.log.error(error);
      return reply.code(400).send({ error: 'start_failed' });
    }
  });

  app.get('/v1/workouts/sessions', async (request, reply) => {
    const auth = await resolveAuthContext(request, opts.auths, opts.appSql);
    if (!auth?.membership || auth.membership.role !== 'student') {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const query = request.query as { status?: string; limit?: string };
    const limit = Math.min(Number(query.limit ?? 50) || 50, 100);

    const rows = await withTenantContext(
      opts.appSql,
      studentCtx(auth),
      async (tx) =>
        tx<
          {
            id: string;
            client_id: string;
            routine_version_id: string;
            routine_version_day_id: string;
            started_at: string;
            finished_at: string | null;
            status: string;
            notes: string;
            day_name: string | null;
            version_number: number | null;
            plan_name: string | null;
          }[]
        >`
        SELECT s.id, s.client_id, s.routine_version_id, s.routine_version_day_id,
               s.started_at::text, s.finished_at::text, s.status, s.notes,
               d.name AS day_name, v.version_number, p.name AS plan_name
        FROM workout_sessions s
        LEFT JOIN routine_version_days d ON d.id = s.routine_version_day_id
        LEFT JOIN routine_versions v ON v.id = s.routine_version_id
        LEFT JOIN routine_plans p ON p.id = v.plan_id
        WHERE s.student_membership_id = ${auth.membership!.id}
          AND (${query.status ?? null}::text IS NULL OR s.status = ${query.status ?? null})
        ORDER BY s.started_at DESC
        LIMIT ${limit}
      `,
    );

    return { sessions: rows.map(mapSession) };
  });

  app.get('/v1/workouts/sessions/active', async (request, reply) => {
    const auth = await resolveAuthContext(request, opts.auths, opts.appSql);
    if (!auth?.membership || auth.membership.role !== 'student') {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const result = await withTenantContext(opts.appSql, studentCtx(auth), async (tx) => {
      const sessions = await tx<
        {
          id: string;
          client_id: string;
          routine_version_id: string;
          routine_version_day_id: string;
          started_at: string;
          finished_at: string | null;
          status: string;
          notes: string;
          day_name: string | null;
        }[]
      >`
        SELECT s.id, s.client_id, s.routine_version_id, s.routine_version_day_id,
               s.started_at::text, s.finished_at::text, s.status, s.notes, d.name AS day_name
        FROM workout_sessions s
        LEFT JOIN routine_version_days d ON d.id = s.routine_version_day_id
        WHERE s.student_membership_id = ${auth.membership!.id}
          AND s.status = 'in_progress'
        LIMIT 1
      `;
      const session = sessions[0];
      if (!session) return null;
      const sets = await loadSets(tx, session.id);
      return { session: mapSession(session), sets };
    });
    return { active: result };
  });

  app.get('/v1/workouts/sessions/:id', async (request, reply) => {
    const auth = await resolveAuthContext(request, opts.auths, opts.appSql);
    if (!auth?.membership) return reply.code(401).send({ error: 'unauthorized' });
    const sessionId = (request.params as { id: string }).id;
    const isOwner = auth.membership.role === 'owner';
    const isStudent = auth.membership.role === 'student';
    if (!isOwner && !isStudent) return reply.code(403).send({ error: 'forbidden' });

    const result = await withTenantContext(opts.appSql, studentCtx(auth), async (tx) => {
      const sessions = await tx<
        {
          id: string;
          client_id: string;
          routine_version_id: string;
          routine_version_day_id: string;
          started_at: string;
          finished_at: string | null;
          status: string;
          notes: string;
          day_name: string | null;
          version_number: number | null;
          plan_name: string | null;
          student_membership_id: string;
        }[]
      >`
        SELECT s.id, s.client_id, s.routine_version_id, s.routine_version_day_id,
               s.started_at::text, s.finished_at::text, s.status, s.notes,
               s.student_membership_id, d.name AS day_name, v.version_number, p.name AS plan_name
        FROM workout_sessions s
        LEFT JOIN routine_version_days d ON d.id = s.routine_version_day_id
        LEFT JOIN routine_versions v ON v.id = s.routine_version_id
        LEFT JOIN routine_plans p ON p.id = v.plan_id
        WHERE s.id = ${sessionId}
      `;
      const session = sessions[0];
      if (!session) return null;
      if (isStudent && session.student_membership_id !== auth.membership!.id) return null;
      const sets = await loadSets(tx, session.id);
      return { session: mapSession(session), sets };
    });

    if (!result) return reply.code(404).send({ error: 'not_found' });
    return result;
  });

  app.put('/v1/workouts/sessions/:id/sets', async (request, reply) => {
    const auth = await resolveAuthContext(request, opts.auths, opts.appSql);
    if (!auth?.membership || auth.membership.role !== 'student') {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const sessionId = (request.params as { id: string }).id;
    const parsed = z
      .object({ sets: z.array(SetUpsertSchema).min(1).max(100) })
      .safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });

    const results: Array<{ clientId: string; setLogId: string; applied: boolean; reason: string }> =
      [];
    try {
      for (const set of parsed.data.sets) {
        const rows = await opts.appSql<{ set_log_id: string; applied: boolean; reason: string }[]>`
          SELECT * FROM app.upsert_workout_set_log(
            ${auth.membership.tenantId},
            ${auth.membership.id},
            ${sessionId},
            ${set.clientId},
            ${set.exerciseId},
            ${set.routineVersionSetId ?? null},
            ${set.position},
            ${set.prescribedRepsMin ?? null},
            ${set.prescribedRepsMax ?? null},
            ${set.prescribedWeightKg ?? null},
            ${set.actualReps ?? null},
            ${set.actualWeightKg ?? null},
            ${set.completed},
            ${set.notes ?? ''},
            ${set.loggedAt ?? null},
            ${set.clientUpdatedAt}
          )
        `;
        const row = rows[0];
        results.push({
          clientId: set.clientId,
          setLogId: row?.set_log_id ?? '',
          applied: Boolean(row?.applied),
          reason: row?.reason ?? 'unknown',
        });
      }
      return { results };
    } catch (error) {
      const msg = error instanceof Error ? error.message : '';
      if (msg.includes('session_not_editable')) {
        return reply.code(409).send({ error: 'session_not_editable' });
      }
      if (msg.includes('session_not_found')) {
        return reply.code(404).send({ error: 'session_not_found' });
      }
      request.log.error(error);
      return reply.code(400).send({ error: 'upsert_failed' });
    }
  });

  app.post('/v1/workouts/sessions/:id/finish', async (request, reply) => {
    const auth = await resolveAuthContext(request, opts.auths, opts.appSql);
    if (!auth?.membership || auth.membership.role !== 'student') {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const sessionId = (request.params as { id: string }).id;
    const parsed = FinishSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });

    try {
      await opts.appSql`
        SELECT app.finish_workout_session(
          ${auth.membership.tenantId},
          ${auth.membership.id},
          ${sessionId},
          ${parsed.data.status},
          ${parsed.data.finishedAt ?? null},
          ${parsed.data.notes ?? null}
        )
      `;
      return { id: sessionId, status: parsed.data.status };
    } catch (error) {
      const msg = error instanceof Error ? error.message : '';
      if (msg.includes('session_not_found')) {
        return reply.code(404).send({ error: 'session_not_found' });
      }
      request.log.error(error);
      return reply.code(400).send({ error: 'finish_failed' });
    }
  });

  app.post('/v1/workouts/sync', async (request, reply) => {
    const auth = await resolveAuthContext(request, opts.auths, opts.appSql);
    if (!auth?.membership || auth.membership.role !== 'student') {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const parsed = SyncSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });

    const sessionMap = new Map<string, string>(); // clientId -> server id
    const sessionResults: Array<{ clientId: string; sessionId: string; error?: string }> = [];
    const setResults: Array<{
      clientId: string;
      setLogId?: string;
      applied?: boolean;
      reason?: string;
      error?: string;
    }> = [];

    for (const session of parsed.data.sessions) {
      try {
        const rows = await opts.appSql<{ start_workout_session: string }[]>`
          SELECT app.start_workout_session(
            ${auth.membership.tenantId},
            ${auth.membership.id},
            ${session.clientId},
            ${session.routineVersionId},
            ${session.routineVersionDayId},
            ${session.startedAt ?? null},
            ${session.notes ?? ''}
          )
        `;
        const sessionId = rows[0]!.start_workout_session;
        sessionMap.set(session.clientId, sessionId);
        if (session.status && session.status !== 'in_progress') {
          await opts.appSql`
            SELECT app.finish_workout_session(
              ${auth.membership.tenantId},
              ${auth.membership.id},
              ${sessionId},
              ${session.status},
              ${session.finishedAt ?? null},
              ${session.notes ?? null}
            )
          `;
        }
        sessionResults.push({ clientId: session.clientId, sessionId });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'sync_failed';
        sessionResults.push({
          clientId: session.clientId,
          sessionId: '',
          error: msg.includes('active_session_exists')
            ? 'active_session_exists'
            : msg.includes('invalid_routine_day')
              ? 'invalid_routine_day'
              : 'sync_failed',
        });
      }
    }

    // Resolve session ids already known on server for sets whose sessions weren't in payload
    for (const set of parsed.data.sets) {
      if (!sessionMap.has(set.sessionClientId)) {
        const existing = await withTenantContext(
          opts.appSql,
          studentCtx(auth),
          async (tx) =>
            tx<{ id: string }[]>`
            SELECT id FROM workout_sessions
            WHERE tenant_id = ${auth.membership!.tenantId}
              AND client_id = ${set.sessionClientId}
              AND student_membership_id = ${auth.membership!.id}
          `,
        );
        if (existing[0]) sessionMap.set(set.sessionClientId, existing[0].id);
      }
    }

    for (const set of parsed.data.sets) {
      const sessionId = sessionMap.get(set.sessionClientId);
      if (!sessionId) {
        setResults.push({ clientId: set.clientId, error: 'session_missing' });
        continue;
      }
      try {
        const rows = await opts.appSql<{ set_log_id: string; applied: boolean; reason: string }[]>`
          SELECT * FROM app.upsert_workout_set_log(
            ${auth.membership.tenantId},
            ${auth.membership.id},
            ${sessionId},
            ${set.clientId},
            ${set.exerciseId},
            ${set.routineVersionSetId ?? null},
            ${set.position},
            ${set.prescribedRepsMin ?? null},
            ${set.prescribedRepsMax ?? null},
            ${set.prescribedWeightKg ?? null},
            ${set.actualReps ?? null},
            ${set.actualWeightKg ?? null},
            ${set.completed},
            ${set.notes ?? ''},
            ${set.loggedAt ?? null},
            ${set.clientUpdatedAt}
          )
        `;
        setResults.push({
          clientId: set.clientId,
          setLogId: rows[0]?.set_log_id,
          applied: rows[0]?.applied,
          reason: rows[0]?.reason,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'upsert_failed';
        setResults.push({
          clientId: set.clientId,
          error: msg.includes('session_not_editable') ? 'session_not_editable' : 'upsert_failed',
        });
      }
    }

    return { sessions: sessionResults, sets: setResults };
  });

  // Trainer views
  app.get('/v1/trainer/students/:membershipId/workouts', async (request, reply) => {
    const auth = await resolveAuthContext(request, opts.auths, opts.appSql);
    if (!auth?.membership || auth.membership.role !== 'owner') {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const membershipId = (request.params as { membershipId: string }).membershipId;

    const rows = await withTenantContext(opts.appSql, studentCtx(auth), async (tx) => {
      const ok = await tx<{ n: number }[]>`
        SELECT count(*)::int AS n FROM memberships
        WHERE id = ${membershipId}
          AND tenant_id = ${auth.membership!.tenantId}
          AND role = 'student'
      `;
      if ((ok[0]?.n ?? 0) === 0) return null;
      return tx<
        {
          id: string;
          client_id: string;
          routine_version_id: string;
          routine_version_day_id: string;
          started_at: string;
          finished_at: string | null;
          status: string;
          notes: string;
          day_name: string | null;
          version_number: number | null;
          plan_name: string | null;
        }[]
      >`
        SELECT s.id, s.client_id, s.routine_version_id, s.routine_version_day_id,
               s.started_at::text, s.finished_at::text, s.status, s.notes,
               d.name AS day_name, v.version_number, p.name AS plan_name
        FROM workout_sessions s
        LEFT JOIN routine_version_days d ON d.id = s.routine_version_day_id
        LEFT JOIN routine_versions v ON v.id = s.routine_version_id
        LEFT JOIN routine_plans p ON p.id = v.plan_id
        WHERE s.student_membership_id = ${membershipId}
        ORDER BY s.started_at DESC
        LIMIT 100
      `;
    });

    if (rows === null) return reply.code(404).send({ error: 'not_found' });
    return { sessions: rows.map(mapSession) };
  });
}
