import type { RealmId } from '@daminatofit/brand';
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import type { Sql } from 'postgres';
import { z } from 'zod';
import { withTenantContext } from '../../db/tenant-tx';
import type { AuthInstance } from '../auth/realms';
import { resolveAuthContext } from '../auth/session';

interface RoutineRouteOpts extends FastifyPluginOptions {
  auths: Record<RealmId, AuthInstance>;
  appSql: Sql;
  migratorSql: Sql;
}

const SetSchema = z.object({
  position: z.number().int().min(0),
  targetRepsMin: z.number().int().min(0).max(500),
  targetRepsMax: z.number().int().min(0).max(500),
  targetWeightKg: z.number().min(0).max(2000).nullable().optional(),
  restSeconds: z.number().int().min(0).max(3600).nullable().optional(),
});

const ExerciseSchema = z.object({
  exerciseId: z.string().uuid(),
  position: z.number().int().min(0),
  notes: z.string().max(4000).default(''),
  restSeconds: z.number().int().min(0).max(3600).nullable().optional(),
  sets: z.array(SetSchema).min(1).max(30),
});

const DaySchema = z.object({
  name: z.string().min(1).max(120),
  weekIndex: z.number().int().min(1).max(52).default(1),
  position: z.number().int().min(0),
  notes: z.string().max(4000).default(''),
  exercises: z.array(ExerciseSchema).min(0).max(40),
});

const DraftBodySchema = z.object({
  name: z.string().min(1).max(160),
  description: z.string().max(4000).default(''),
  changeNote: z.string().max(1000).default(''),
  days: z.array(DaySchema).min(1).max(60),
});

const CreatePlanSchema = z.object({
  name: z.string().min(1).max(160),
  description: z.string().max(4000).default(''),
  kind: z.enum(['template']).default('template'),
});

const AssignSchema = z.object({
  studentMembershipIds: z.array(z.string().uuid()).min(1).max(50),
  startsOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  endsOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  replaceActive: z.boolean().default(true),
});

const PublishSchema = z.object({
  changeNote: z.string().max(1000).optional(),
  startsOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  endsOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

type SetRow = {
  id: string;
  position: number;
  target_reps_min: number;
  target_reps_max: number;
  target_weight_kg: string | null;
  rest_seconds: number | null;
};

type ExerciseRow = {
  id: string;
  exercise_id: string;
  exercise_revision_id: string;
  position: number;
  notes: string;
  rest_seconds: number | null;
  exercise_name: string;
  instructions: string;
  video_media_id: string | null;
};

type DayRow = {
  id: string;
  name: string;
  week_index: number;
  position: number;
  notes: string;
};

async function loadVersionTree(sql: Sql, versionId: string) {
  const days = await sql<DayRow[]>`
    SELECT id, name, week_index, position, notes
    FROM routine_version_days
    WHERE version_id = ${versionId}
    ORDER BY week_index, position
  `;
  const dayIds = days.map((d) => d.id);
  const exercises =
    dayIds.length === 0
      ? []
      : await sql<(ExerciseRow & { day_id: string })[]>`
          SELECT e.id, e.day_id, e.exercise_id, e.exercise_revision_id, e.position, e.notes,
                 e.rest_seconds, r.name AS exercise_name, r.instructions, r.video_media_id
          FROM routine_version_exercises e
          JOIN exercise_revisions r ON r.id = e.exercise_revision_id
          WHERE e.day_id = ANY(${dayIds})
          ORDER BY e.position
        `;
  const exIds = exercises.map((e) => e.id);
  const sets =
    exIds.length === 0
      ? []
      : await sql<(SetRow & { version_exercise_id: string })[]>`
          SELECT id, version_exercise_id, position, target_reps_min, target_reps_max,
                 target_weight_kg::text, rest_seconds
          FROM routine_version_sets
          WHERE version_exercise_id = ANY(${exIds})
          ORDER BY position
        `;

  const setsByEx = new Map<string, SetRow[]>();
  for (const s of sets) {
    const list = setsByEx.get(s.version_exercise_id) ?? [];
    list.push(s);
    setsByEx.set(s.version_exercise_id, list);
  }
  const exByDay = new Map<string, (ExerciseRow & { day_id: string })[]>();
  for (const e of exercises) {
    const list = exByDay.get(e.day_id) ?? [];
    list.push(e);
    exByDay.set(e.day_id, list);
  }

  return days.map((d) => ({
    id: d.id,
    name: d.name,
    weekIndex: d.week_index,
    position: d.position,
    notes: d.notes,
    exercises: (exByDay.get(d.id) ?? []).map((e) => ({
      id: e.id,
      exerciseId: e.exercise_id,
      exerciseRevisionId: e.exercise_revision_id,
      position: e.position,
      notes: e.notes,
      restSeconds: e.rest_seconds,
      exerciseName: e.exercise_name,
      instructions: e.instructions,
      videoMediaId: e.video_media_id,
      sets: (setsByEx.get(e.id) ?? []).map((s) => ({
        id: s.id,
        position: s.position,
        targetRepsMin: s.target_reps_min,
        targetRepsMax: s.target_reps_max,
        targetWeightKg: s.target_weight_kg === null ? null : Number(s.target_weight_kg),
        restSeconds: s.rest_seconds,
      })),
    })),
  }));
}

function ownerCtx(auth: NonNullable<Awaited<ReturnType<typeof resolveAuthContext>>>) {
  return {
    realm: auth.realm,
    userId: auth.domainUser.id,
    tenantId: auth.membership!.tenantId,
    membershipId: auth.membership!.id,
    role: 'owner' as const,
  };
}

export async function routinesRoutes(app: FastifyInstance, opts: RoutineRouteOpts) {
  app.get('/v1/routines', async (request, reply) => {
    const auth = await resolveAuthContext(request, opts.auths, opts.appSql);
    if (!auth?.membership || auth.membership.role !== 'owner') {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const query = request.query as { kind?: string; status?: string };
    const kind = query.kind === 'assigned' ? 'assigned' : 'template';
    const status = query.status === 'archived' ? 'archived' : 'active';

    const rows = await withTenantContext(
      opts.appSql,
      ownerCtx(auth),
      async (tx) =>
        tx<
          {
            id: string;
            kind: string;
            name: string;
            description: string;
            status: string;
            current_version_id: string | null;
            student_membership_id: string | null;
            updated_at: string;
            version_number: number | null;
            version_status: string | null;
          }[]
        >`
        SELECT p.id, p.kind, p.name, p.description, p.status, p.current_version_id,
               p.student_membership_id, p.updated_at::text,
               v.version_number, v.status AS version_status
        FROM routine_plans p
        LEFT JOIN routine_versions v ON v.id = p.current_version_id
        WHERE p.tenant_id = ${auth.membership!.tenantId}
          AND p.kind = ${kind}
          AND p.status = ${status}
        ORDER BY p.updated_at DESC
      `,
    );

    return {
      routines: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        name: r.name,
        description: r.description,
        status: r.status,
        currentVersionId: r.current_version_id,
        studentMembershipId: r.student_membership_id,
        currentVersionNumber: r.version_number,
        currentVersionStatus: r.version_status,
        updatedAt: r.updated_at,
      })),
    };
  });

  app.post('/v1/routines', async (request, reply) => {
    const auth = await resolveAuthContext(request, opts.auths, opts.appSql);
    if (!auth?.membership || auth.membership.role !== 'owner') {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const parsed = CreatePlanSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });

    const planId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const tenantId = auth.membership.tenantId;

    await withTenantContext(opts.appSql, ownerCtx(auth), async (tx) => {
      await tx`
        INSERT INTO routine_plans (
          id, tenant_id, kind, name, description, status, created_by
        ) VALUES (
          ${planId}, ${tenantId}, 'template', ${parsed.data.name},
          ${parsed.data.description}, 'active', ${auth.domainUser.id}
        )
      `;
      await tx`
        INSERT INTO routine_versions (id, tenant_id, plan_id, version_number, status)
        VALUES (${versionId}, ${tenantId}, ${planId}, 1, 'draft')
      `;
    });

    return reply.code(201).send({ id: planId, draftVersionId: versionId });
  });

  app.get('/v1/routines/:id', async (request, reply) => {
    const auth = await resolveAuthContext(request, opts.auths, opts.appSql);
    if (!auth?.membership) return reply.code(401).send({ error: 'unauthorized' });
    const planId = (request.params as { id: string }).id;
    const isOwner = auth.membership.role === 'owner';

    const result = await withTenantContext(
      opts.appSql,
      {
        realm: auth.realm,
        userId: auth.domainUser.id,
        tenantId: auth.membership.tenantId,
        membershipId: auth.membership.id,
        role: auth.membership.role,
      },
      async (tx) => {
        const plans = await tx<
          {
            id: string;
            kind: string;
            name: string;
            description: string;
            status: string;
            current_version_id: string | null;
            source_version_id: string | null;
            student_membership_id: string | null;
          }[]
        >`
          SELECT id, kind, name, description, status, current_version_id,
                 source_version_id, student_membership_id
          FROM routine_plans WHERE id = ${planId}
        `;
        const plan = plans[0];
        if (!plan) return null;

        let draft: { id: string; version_number: number; change_note: string } | null = null;
        if (isOwner) {
          const drafts = await tx<{ id: string; version_number: number; change_note: string }[]>`
            SELECT id, version_number, change_note FROM routine_versions
            WHERE plan_id = ${planId} AND status = 'draft'
          `;
          draft = drafts[0] ?? null;
        }

        const versions = await tx<
          {
            id: string;
            version_number: number;
            status: string;
            change_note: string;
            published_at: string | null;
            starts_on: string | null;
            ends_on: string | null;
          }[]
        >`
          SELECT id, version_number, status, change_note,
                 published_at::text, starts_on::text, ends_on::text
          FROM routine_versions
          WHERE plan_id = ${planId}
          ORDER BY version_number DESC
        `;

        const focusId = isOwner ? (draft?.id ?? plan.current_version_id) : plan.current_version_id;
        const tree = focusId ? await loadVersionTree(tx, focusId) : [];

        return { plan, draft, versions, focusId, tree };
      },
    );

    if (!result) return reply.code(404).send({ error: 'not_found' });

    return {
      routine: {
        id: result.plan.id,
        kind: result.plan.kind,
        name: result.plan.name,
        description: result.plan.description,
        status: result.plan.status,
        currentVersionId: result.plan.current_version_id,
        sourceVersionId: result.plan.source_version_id,
        studentMembershipId: result.plan.student_membership_id,
        draftVersionId: result.draft?.id ?? null,
        versions: result.versions.map((v) => ({
          id: v.id,
          versionNumber: v.version_number,
          status: v.status,
          changeNote: v.change_note,
          publishedAt: v.published_at,
          startsOn: v.starts_on,
          endsOn: v.ends_on,
        })),
        editingVersionId: result.focusId,
        days: result.tree,
      },
    };
  });

  app.put('/v1/routines/:id/draft', async (request, reply) => {
    const auth = await resolveAuthContext(request, opts.auths, opts.appSql);
    if (!auth?.membership || auth.membership.role !== 'owner') {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const planId = (request.params as { id: string }).id;
    const parsed = DraftBodySchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });

    const tenantId = auth.membership.tenantId;

    try {
      const draftId = await withTenantContext(opts.appSql, ownerCtx(auth), async (tx) => {
        const ensured = await tx<{ ensure_routine_draft: string }[]>`
          SELECT app.ensure_routine_draft(${tenantId}, ${auth.domainUser.id}, ${planId})
        `;
        const id = ensured[0]?.ensure_routine_draft;
        if (!id) throw new Error('ensure_failed');

        // Validate exercises belong to tenant or global and pin current revision
        const exerciseIds = [
          ...new Set(parsed.data.days.flatMap((d) => d.exercises.map((e) => e.exerciseId))),
        ];
        const revisions =
          exerciseIds.length === 0
            ? []
            : await tx<{ id: string; current_revision_id: string; tenant_id: string | null }[]>`
                SELECT id, current_revision_id, tenant_id FROM exercises
                WHERE id = ANY(${exerciseIds})
                  AND archived_at IS NULL
                  AND (tenant_id IS NULL OR tenant_id = ${tenantId})
                  AND current_revision_id IS NOT NULL
              `;
        if (revisions.length !== exerciseIds.length) {
          throw new Error('invalid_exercise');
        }
        const revByEx = new Map(revisions.map((r) => [r.id, r.current_revision_id]));

        await tx`DELETE FROM routine_version_days WHERE version_id = ${id}`;

        for (const day of parsed.data.days) {
          const dayId = crypto.randomUUID();
          await tx`
            INSERT INTO routine_version_days (
              id, tenant_id, version_id, name, week_index, position, notes
            ) VALUES (
              ${dayId}, ${tenantId}, ${id}, ${day.name}, ${day.weekIndex},
              ${day.position}, ${day.notes}
            )
          `;
          for (const ex of day.exercises) {
            const revisionId = revByEx.get(ex.exerciseId);
            if (!revisionId) throw new Error('invalid_exercise');
            for (const s of ex.sets) {
              if (s.targetRepsMax < s.targetRepsMin) throw new Error('invalid_sets');
            }
            const exRowId = crypto.randomUUID();
            await tx`
              INSERT INTO routine_version_exercises (
                id, tenant_id, day_id, exercise_id, exercise_revision_id,
                position, notes, rest_seconds
              ) VALUES (
                ${exRowId}, ${tenantId}, ${dayId}, ${ex.exerciseId}, ${revisionId},
                ${ex.position}, ${ex.notes}, ${ex.restSeconds ?? null}
              )
            `;
            for (const s of ex.sets) {
              await tx`
                INSERT INTO routine_version_sets (
                  tenant_id, version_exercise_id, position,
                  target_reps_min, target_reps_max, target_weight_kg, rest_seconds
                ) VALUES (
                  ${tenantId}, ${exRowId}, ${s.position},
                  ${s.targetRepsMin}, ${s.targetRepsMax},
                  ${s.targetWeightKg ?? null}, ${s.restSeconds ?? null}
                )
              `;
            }
          }
        }

        await tx`
          UPDATE routine_versions SET
            change_note = ${parsed.data.changeNote},
            updated_at = now()
          WHERE id = ${id}
        `;
        await tx`
          UPDATE routine_plans SET
            name = ${parsed.data.name},
            description = ${parsed.data.description},
            updated_at = now()
          WHERE id = ${planId}
        `;
        return id;
      });

      return { draftVersionId: draftId, status: 'saved' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'save_failed';
      if (message === 'invalid_exercise' || message === 'invalid_sets') {
        return reply.code(400).send({ error: message });
      }
      request.log.error(error);
      return reply.code(400).send({ error: 'save_failed' });
    }
  });

  app.post('/v1/routines/:id/publish', async (request, reply) => {
    const auth = await resolveAuthContext(request, opts.auths, opts.appSql);
    if (!auth?.membership || auth.membership.role !== 'owner') {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const planId = (request.params as { id: string }).id;
    const parsed = PublishSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });

    try {
      const rows = await opts.appSql<{ publish_routine_version: string }[]>`
        SELECT app.publish_routine_version(
          ${auth.membership.tenantId},
          ${auth.domainUser.id},
          ${planId},
          ${parsed.data.changeNote ?? null},
          ${parsed.data.startsOn ?? null},
          ${parsed.data.endsOn ?? null}
        )
      `;
      return { versionId: rows[0]?.publish_routine_version, status: 'published' };
    } catch (error) {
      const msg = error instanceof Error ? error.message : '';
      if (msg.includes('no_draft')) return reply.code(400).send({ error: 'no_draft' });
      if (msg.includes('empty_draft')) return reply.code(400).send({ error: 'empty_draft' });
      request.log.error(error);
      return reply.code(400).send({ error: 'publish_failed' });
    }
  });

  app.post('/v1/routines/:id/new-draft', async (request, reply) => {
    const auth = await resolveAuthContext(request, opts.auths, opts.appSql);
    if (!auth?.membership || auth.membership.role !== 'owner') {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const planId = (request.params as { id: string }).id;
    try {
      const rows = await opts.appSql<{ ensure_routine_draft: string }[]>`
        SELECT app.ensure_routine_draft(
          ${auth.membership.tenantId},
          ${auth.domainUser.id},
          ${planId}
        )
      `;
      return { draftVersionId: rows[0]?.ensure_routine_draft };
    } catch (error) {
      request.log.error(error);
      return reply.code(400).send({ error: 'draft_failed' });
    }
  });

  app.post('/v1/routines/:id/duplicate', async (request, reply) => {
    const auth = await resolveAuthContext(request, opts.auths, opts.appSql);
    if (!auth?.membership || auth.membership.role !== 'owner') {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const planId = (request.params as { id: string }).id;
    const tenantId = auth.membership.tenantId;

    try {
      const newPlanId = await withTenantContext(opts.appSql, ownerCtx(auth), async (tx) => {
        const plans = await tx<
          {
            name: string;
            description: string;
            current_version_id: string | null;
            kind: string;
          }[]
        >`
          SELECT name, description, current_version_id, kind FROM routine_plans
          WHERE id = ${planId} AND tenant_id = ${tenantId}
        `;
        const plan = plans[0];
        if (!plan || plan.kind !== 'template') throw new Error('not_found');

        let sourceVersion = plan.current_version_id;
        if (!sourceVersion) {
          const draft = await tx<{ id: string }[]>`
            SELECT id FROM routine_versions WHERE plan_id = ${planId} AND status = 'draft'
          `;
          sourceVersion = draft[0]?.id ?? null;
        }
        if (!sourceVersion) throw new Error('empty');

        const id = crypto.randomUUID();
        await tx`
          INSERT INTO routine_plans (
            id, tenant_id, kind, name, description, status, source_version_id, created_by
          ) VALUES (
            ${id}, ${tenantId}, 'template', ${`${plan.name} (copia)`},
            ${plan.description}, 'active', ${sourceVersion}, ${auth.domainUser.id}
          )
        `;
        const newVersion = await tx<{ copy_routine_version: string }[]>`
          SELECT app.copy_routine_version(
            ${sourceVersion}, ${id}, ${tenantId}, 1, 'draft',
            NULL, NULL, NULL, 'Duplicado'
          )
        `;
        return { id, draftVersionId: newVersion[0]?.copy_routine_version };
      });
      return reply.code(201).send(newPlanId);
    } catch (error) {
      request.log.error(error);
      return reply.code(400).send({ error: 'duplicate_failed' });
    }
  });

  app.post('/v1/routines/:id/archive', async (request, reply) => {
    const auth = await resolveAuthContext(request, opts.auths, opts.appSql);
    if (!auth?.membership || auth.membership.role !== 'owner') {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const planId = (request.params as { id: string }).id;
    const updated = await withTenantContext(
      opts.appSql,
      ownerCtx(auth),
      async (tx) =>
        tx<{ id: string }[]>`
        UPDATE routine_plans
        SET status = 'archived', archived_at = now(), updated_at = now()
        WHERE id = ${planId} AND tenant_id = ${auth.membership!.tenantId} AND status = 'active'
        RETURNING id
      `,
    );
    if (!updated[0]) return reply.code(404).send({ error: 'not_found' });
    return { id: planId, status: 'archived' };
  });

  app.post('/v1/routines/:id/assign', async (request, reply) => {
    const auth = await resolveAuthContext(request, opts.auths, opts.appSql);
    if (!auth?.membership || auth.membership.role !== 'owner') {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const planId = (request.params as { id: string }).id;
    const parsed = AssignSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });

    const assigned: string[] = [];
    try {
      for (const studentId of parsed.data.studentMembershipIds) {
        const rows = await opts.appSql<{ assign_routine_to_student: string }[]>`
          SELECT app.assign_routine_to_student(
            ${auth.membership.tenantId},
            ${auth.domainUser.id},
            ${planId},
            ${studentId},
            ${parsed.data.startsOn ?? null},
            ${parsed.data.endsOn ?? null},
            ${parsed.data.replaceActive}
          )
        `;
        if (rows[0]?.assign_routine_to_student) {
          assigned.push(rows[0].assign_routine_to_student);
        }
      }
      return reply.code(201).send({ assignedPlanIds: assigned });
    } catch (error) {
      const msg = error instanceof Error ? error.message : '';
      if (msg.includes('template_not_published')) {
        return reply.code(400).send({ error: 'template_not_published' });
      }
      if (msg.includes('invalid_student')) {
        return reply.code(400).send({ error: 'invalid_student' });
      }
      request.log.error(error);
      return reply.code(400).send({ error: 'assign_failed' });
    }
  });

  app.get('/v1/routines/:id/assignments', async (request, reply) => {
    const auth = await resolveAuthContext(request, opts.auths, opts.appSql);
    if (!auth?.membership || auth.membership.role !== 'owner') {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const templateId = (request.params as { id: string }).id;
    const tenantId = auth.membership.tenantId;

    const rows = await withTenantContext(opts.appSql, ownerCtx(auth), async (tx) => {
      const versions = await tx<{ id: string }[]>`
        SELECT id FROM routine_versions WHERE plan_id = ${templateId} AND tenant_id = ${tenantId}
      `;
      const versionIds = versions.map((v) => v.id);
      if (versionIds.length === 0) return [];
      return tx<
        {
          id: string;
          name: string;
          status: string;
          student_membership_id: string;
          current_version_id: string | null;
          source_version_id: string | null;
          version_number: number | null;
          starts_on: string | null;
          ends_on: string | null;
          student_name: string | null;
        }[]
      >`
        SELECT p.id, p.name, p.status, p.student_membership_id, p.current_version_id,
               p.source_version_id, v.version_number, v.starts_on::text, v.ends_on::text,
               u.display_name AS student_name
        FROM routine_plans p
        LEFT JOIN routine_versions v ON v.id = p.current_version_id
        LEFT JOIN memberships m ON m.id = p.student_membership_id
        LEFT JOIN users u ON u.id = m.user_id
        WHERE p.tenant_id = ${tenantId}
          AND p.kind = 'assigned'
          AND p.source_version_id = ANY(${versionIds})
        ORDER BY p.created_at DESC
      `;
    });

    return {
      assignments: rows.map((r) => ({
        id: r.id,
        name: r.name,
        status: r.status,
        studentMembershipId: r.student_membership_id,
        studentName: r.student_name,
        currentVersionId: r.current_version_id,
        currentVersionNumber: r.version_number,
        sourceVersionId: r.source_version_id,
        startsOn: r.starts_on,
        endsOn: r.ends_on,
      })),
    };
  });

  // Student-facing
  app.get('/v1/student/routines', async (request, reply) => {
    const auth = await resolveAuthContext(request, opts.auths, opts.appSql);
    if (!auth?.membership || auth.membership.role !== 'student') {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const rows = await withTenantContext(
      opts.appSql,
      {
        realm: auth.realm,
        userId: auth.domainUser.id,
        tenantId: auth.membership.tenantId,
        membershipId: auth.membership.id,
        role: 'student',
      },
      async (tx) =>
        tx<
          {
            id: string;
            name: string;
            description: string;
            current_version_id: string | null;
            version_number: number | null;
            starts_on: string | null;
            ends_on: string | null;
            status: string;
          }[]
        >`
          SELECT p.id, p.name, p.description, p.current_version_id, p.status,
                 v.version_number, v.starts_on::text, v.ends_on::text
          FROM routine_plans p
          LEFT JOIN routine_versions v ON v.id = p.current_version_id
          WHERE p.kind = 'assigned'
            AND p.student_membership_id = ${auth.membership!.id}
            AND p.status = 'active'
          ORDER BY p.updated_at DESC
        `,
    );

    return {
      routines: rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        currentVersionId: r.current_version_id,
        versionNumber: r.version_number,
        startsOn: r.starts_on,
        endsOn: r.ends_on,
        status: r.status,
        isCurrent: true,
      })),
    };
  });

  app.get('/v1/student/routines/:id', async (request, reply) => {
    const auth = await resolveAuthContext(request, opts.auths, opts.appSql);
    if (!auth?.membership || auth.membership.role !== 'student') {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const planId = (request.params as { id: string }).id;

    const result = await withTenantContext(
      opts.appSql,
      {
        realm: auth.realm,
        userId: auth.domainUser.id,
        tenantId: auth.membership.tenantId,
        membershipId: auth.membership.id,
        role: 'student',
      },
      async (tx) => {
        const plans = await tx<
          {
            id: string;
            name: string;
            description: string;
            current_version_id: string | null;
            status: string;
          }[]
        >`
          SELECT id, name, description, current_version_id, status
          FROM routine_plans
          WHERE id = ${planId}
            AND kind = 'assigned'
            AND student_membership_id = ${auth.membership!.id}
        `;
        const plan = plans[0];
        if (!plan?.current_version_id) return null;
        const versions = await tx<
          {
            id: string;
            version_number: number;
            status: string;
            starts_on: string | null;
            ends_on: string | null;
            change_note: string;
          }[]
        >`
          SELECT id, version_number, status, starts_on::text, ends_on::text, change_note
          FROM routine_versions WHERE id = ${plan.current_version_id}
        `;
        const version = versions[0];
        if (!version) return null;
        const days = await loadVersionTree(tx, version.id);
        return { plan, version, days };
      },
    );

    if (!result) return reply.code(404).send({ error: 'not_found' });
    return {
      routine: {
        id: result.plan.id,
        name: result.plan.name,
        description: result.plan.description,
        status: result.plan.status,
        version: {
          id: result.version.id,
          versionNumber: result.version.version_number,
          status: result.version.status,
          startsOn: result.version.starts_on,
          endsOn: result.version.ends_on,
          changeNote: result.version.change_note,
        },
        days: result.days,
      },
    };
  });
}
