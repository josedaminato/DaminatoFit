import type { RealmId } from '@daminatofit/brand';
import type { FastifyInstance } from 'fastify';
import type { Sql } from 'postgres';
import { z } from 'zod';
import { withTenantContext } from '../../db/tenant-tx';
import type { AuthInstance } from '../auth/realms';
import { resolveAuthContext } from '../auth/session';

const ExerciseBodySchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(4000).default(''),
  instructions: z.string().trim().max(8000).default(''),
  primaryMuscleGroupId: z.string().uuid().nullable().optional(),
  secondaryMuscleGroupIds: z.array(z.string().uuid()).max(8).default([]),
  equipmentId: z.string().uuid().nullable().optional(),
  videoMediaId: z.string().uuid().nullable().optional(),
});

type ExerciseRow = {
  id: string;
  tenant_id: string | null;
  based_on_exercise_id: string | null;
  archived_at: string | null;
  revision_id: string;
  name: string;
  description: string;
  instructions: string;
  primary_muscle_group_id: string | null;
  equipment_id: string | null;
  video_media_id: string | null;
  revision_number: number;
  scope: 'global' | 'tenant';
};

function mapExercise(row: ExerciseRow, secondary: string[] = []) {
  return {
    id: row.id,
    scope: row.tenant_id ? 'tenant' : 'global',
    basedOnExerciseId: row.based_on_exercise_id,
    archivedAt: row.archived_at,
    revision: {
      id: row.revision_id,
      number: row.revision_number,
      name: row.name,
      description: row.description,
      instructions: row.instructions,
      primaryMuscleGroupId: row.primary_muscle_group_id,
      secondaryMuscleGroupIds: secondary,
      equipmentId: row.equipment_id,
      videoMediaId: row.video_media_id,
    },
  };
}

export async function exercisesRoutes(
  app: FastifyInstance,
  opts: { auths: Record<RealmId, AuthInstance>; appSql: Sql; migratorSql: Sql },
): Promise<void> {
  app.get('/v1/muscle-groups', async (request, reply) => {
    const auth = await resolveAuthContext(request, opts.auths, opts.appSql);
    if (!auth) return reply.code(401).send({ error: 'unauthorized' });
    const withCtx = await withTenantContext(
      opts.appSql,
      {
        realm: auth.realm,
        userId: auth.domainUser.id,
        tenantId: auth.membership?.tenantId ?? null,
        membershipId: auth.membership?.id ?? null,
        role: auth.membership?.role ?? null,
      },
      async (tx) =>
        tx<{ id: string; slug: string; name: string }[]>`
          SELECT id, slug, name FROM muscle_groups ORDER BY name
        `,
    );
    return { muscleGroups: withCtx };
  });

  app.get('/v1/equipment', async (request, reply) => {
    const auth = await resolveAuthContext(request, opts.auths, opts.appSql);
    if (!auth) return reply.code(401).send({ error: 'unauthorized' });
    const rows = await withTenantContext(
      opts.appSql,
      {
        realm: auth.realm,
        userId: auth.domainUser.id,
        tenantId: auth.membership?.tenantId ?? null,
        membershipId: auth.membership?.id ?? null,
        role: auth.membership?.role ?? null,
      },
      async (tx) =>
        tx<{ id: string; slug: string; name: string }[]>`
          SELECT id, slug, name FROM equipment ORDER BY name
        `,
    );
    return { equipment: rows };
  });

  app.get('/v1/exercises', async (request, reply) => {
    const auth = await resolveAuthContext(request, opts.auths, opts.appSql);
    if (!auth?.membership) return reply.code(401).send({ error: 'unauthorized' });

    const query = request.query as {
      scope?: string;
      q?: string;
      muscle?: string;
      includeArchived?: string;
    };
    const scope = query.scope ?? 'all';
    const q = (query.q ?? '').trim().toLowerCase();
    const muscle = query.muscle?.trim() ?? null;

    const includeArchived = query.includeArchived === 'true';
    const like = q ? `%${q}%` : null;
    const tenantId = auth.membership.tenantId;

    const rows = await withTenantContext(
      opts.appSql,
      {
        realm: auth.realm,
        userId: auth.domainUser.id,
        tenantId,
        membershipId: auth.membership.id,
        role: auth.membership.role,
      },
      async (tx) => {
        if (scope === 'global') {
          return tx<ExerciseRow[]>`
            SELECT e.id, e.tenant_id, e.based_on_exercise_id, e.archived_at,
                   r.id AS revision_id, r.name, r.description, r.instructions,
                   r.primary_muscle_group_id, r.equipment_id, r.video_media_id, r.revision_number,
                   'global' AS scope
            FROM exercises e
            JOIN exercise_revisions r ON r.id = e.current_revision_id
            WHERE e.tenant_id IS NULL
              AND (${includeArchived} OR e.archived_at IS NULL)
              AND (${like}::text IS NULL OR lower(r.name) LIKE ${like})
              AND (
                ${muscle}::text IS NULL
                OR r.primary_muscle_group_id::text = ${muscle}
                OR EXISTS (
                  SELECT 1 FROM exercise_muscle_groups emg
                  WHERE emg.exercise_revision_id = r.id AND emg.muscle_group_id::text = ${muscle}
                )
              )
            ORDER BY r.name
          `;
        }
        if (scope === 'mine') {
          return tx<ExerciseRow[]>`
            SELECT e.id, e.tenant_id, e.based_on_exercise_id, e.archived_at,
                   r.id AS revision_id, r.name, r.description, r.instructions,
                   r.primary_muscle_group_id, r.equipment_id, r.video_media_id, r.revision_number,
                   'tenant' AS scope
            FROM exercises e
            JOIN exercise_revisions r ON r.id = e.current_revision_id
            WHERE e.tenant_id = ${tenantId}
              AND (${includeArchived} OR e.archived_at IS NULL)
              AND (${like}::text IS NULL OR lower(r.name) LIKE ${like})
              AND (
                ${muscle}::text IS NULL
                OR r.primary_muscle_group_id::text = ${muscle}
                OR EXISTS (
                  SELECT 1 FROM exercise_muscle_groups emg
                  WHERE emg.exercise_revision_id = r.id AND emg.muscle_group_id::text = ${muscle}
                )
              )
            ORDER BY r.name
          `;
        }
        return tx<ExerciseRow[]>`
          SELECT e.id, e.tenant_id, e.based_on_exercise_id, e.archived_at,
                 r.id AS revision_id, r.name, r.description, r.instructions,
                 r.primary_muscle_group_id, r.equipment_id, r.video_media_id, r.revision_number,
                 CASE WHEN e.tenant_id IS NULL THEN 'global' ELSE 'tenant' END AS scope
          FROM exercises e
          JOIN exercise_revisions r ON r.id = e.current_revision_id
          WHERE (e.tenant_id IS NULL OR e.tenant_id = ${tenantId})
            AND (${includeArchived} OR e.archived_at IS NULL)
            AND (${like}::text IS NULL OR lower(r.name) LIKE ${like})
            AND (
              ${muscle}::text IS NULL
              OR r.primary_muscle_group_id::text = ${muscle}
              OR EXISTS (
                SELECT 1 FROM exercise_muscle_groups emg
                WHERE emg.exercise_revision_id = r.id AND emg.muscle_group_id::text = ${muscle}
              )
            )
          ORDER BY e.tenant_id NULLS FIRST, r.name
        `;
      },
    );

    const revisionIds = rows.map((r) => r.revision_id);
    const secondaries =
      revisionIds.length === 0
        ? []
        : await withTenantContext(
            opts.appSql,
            {
              realm: auth.realm,
              userId: auth.domainUser.id,
              tenantId: auth.membership.tenantId,
              membershipId: auth.membership.id,
              role: auth.membership.role,
            },
            async (tx) =>
              tx<{ exercise_revision_id: string; muscle_group_id: string }[]>`
                SELECT exercise_revision_id, muscle_group_id
                FROM exercise_muscle_groups
                WHERE role = 'secondary'
                  AND exercise_revision_id = ANY(${revisionIds})
              `,
          );

    const byRev = new Map<string, string[]>();
    for (const s of secondaries) {
      const list = byRev.get(s.exercise_revision_id) ?? [];
      list.push(s.muscle_group_id);
      byRev.set(s.exercise_revision_id, list);
    }

    return {
      exercises: rows.map((r) => mapExercise(r, byRev.get(r.revision_id) ?? [])),
    };
  });

  app.get('/v1/exercises/:id', async (request, reply) => {
    const auth = await resolveAuthContext(request, opts.auths, opts.appSql);
    if (!auth?.membership) return reply.code(401).send({ error: 'unauthorized' });
    const id = (request.params as { id: string }).id;

    const rows = await withTenantContext(
      opts.appSql,
      {
        realm: auth.realm,
        userId: auth.domainUser.id,
        tenantId: auth.membership.tenantId,
        membershipId: auth.membership.id,
        role: auth.membership.role,
      },
      async (tx) =>
        tx<ExerciseRow[]>`
          SELECT e.id, e.tenant_id, e.based_on_exercise_id, e.archived_at,
                 r.id AS revision_id, r.name, r.description, r.instructions,
                 r.primary_muscle_group_id, r.equipment_id, r.video_media_id, r.revision_number,
                 CASE WHEN e.tenant_id IS NULL THEN 'global' ELSE 'tenant' END AS scope
          FROM exercises e
          JOIN exercise_revisions r ON r.id = e.current_revision_id
          WHERE e.id = ${id}
        `,
    );
    if (!rows[0]) return reply.code(404).send({ error: 'not_found' });

    const secondary = await withTenantContext(
      opts.appSql,
      {
        realm: auth.realm,
        userId: auth.domainUser.id,
        tenantId: auth.membership.tenantId,
        membershipId: auth.membership.id,
        role: auth.membership.role,
      },
      async (tx) =>
        tx<{ muscle_group_id: string }[]>`
          SELECT muscle_group_id FROM exercise_muscle_groups
          WHERE exercise_revision_id = ${rows[0]!.revision_id} AND role = 'secondary'
        `,
    );

    return {
      exercise: mapExercise(
        rows[0],
        secondary.map((s) => s.muscle_group_id),
      ),
    };
  });

  app.post('/v1/exercises', async (request, reply) => {
    const auth = await resolveAuthContext(request, opts.auths, opts.appSql);
    if (!auth?.membership || auth.membership.role !== 'owner') {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const parsed = ExerciseBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });

    try {
      const created = await opts.appSql<{ exercise_id: string; revision_id: string }[]>`
        SELECT * FROM app.create_exercise_with_revision(
          ${auth.membership.tenantId},
          ${auth.domainUser.id},
          ${null},
          ${parsed.data.name},
          ${parsed.data.description},
          ${parsed.data.instructions},
          ${parsed.data.primaryMuscleGroupId ?? null},
          ${parsed.data.equipmentId ?? null},
          ${parsed.data.videoMediaId ?? null},
          ${parsed.data.secondaryMuscleGroupIds}
        )
      `;
      return reply.code(201).send({
        id: created[0]?.exercise_id,
        revisionId: created[0]?.revision_id,
      });
    } catch (error) {
      request.log.error(error);
      return reply.code(400).send({ error: 'create_failed' });
    }
  });

  app.post('/v1/exercises/:id/customize', async (request, reply) => {
    const auth = await resolveAuthContext(request, opts.auths, opts.appSql);
    if (!auth?.membership || auth.membership.role !== 'owner') {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const sourceId = (request.params as { id: string }).id;
    const parsed = ExerciseBodySchema.partial({
      name: true,
      description: true,
      instructions: true,
    })
      .extend({
        name: z.string().trim().min(1).max(160).optional(),
        description: z.string().trim().max(4000).optional(),
        instructions: z.string().trim().max(8000).optional(),
        primaryMuscleGroupId: z.string().uuid().nullable().optional(),
        secondaryMuscleGroupIds: z.array(z.string().uuid()).max(8).optional(),
        equipmentId: z.string().uuid().nullable().optional(),
        videoMediaId: z.string().uuid().nullable().optional(),
      })
      .safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });

    const source = await withTenantContext(
      opts.appSql,
      {
        realm: auth.realm,
        userId: auth.domainUser.id,
        tenantId: auth.membership.tenantId,
        membershipId: auth.membership.id,
        role: 'owner',
      },
      async (tx) =>
        tx<ExerciseRow[]>`
          SELECT e.id, e.tenant_id, e.based_on_exercise_id, e.archived_at,
                 r.id AS revision_id, r.name, r.description, r.instructions,
                 r.primary_muscle_group_id, r.equipment_id, r.video_media_id, r.revision_number,
                 'global' AS scope
          FROM exercises e
          JOIN exercise_revisions r ON r.id = e.current_revision_id
          WHERE e.id = ${sourceId} AND e.tenant_id IS NULL
        `,
    );
    if (!source[0]) return reply.code(404).send({ error: 'global_exercise_not_found' });

    const secondary = await withTenantContext(
      opts.appSql,
      {
        realm: auth.realm,
        userId: auth.domainUser.id,
        tenantId: auth.membership.tenantId,
        membershipId: auth.membership.id,
        role: 'owner',
      },
      async (tx) =>
        tx<{ muscle_group_id: string }[]>`
          SELECT muscle_group_id FROM exercise_muscle_groups
          WHERE exercise_revision_id = ${source[0]!.revision_id} AND role = 'secondary'
        `,
    );

    const body = parsed.data;
    try {
      const created = await opts.appSql<{ exercise_id: string; revision_id: string }[]>`
        SELECT * FROM app.create_exercise_with_revision(
          ${auth.membership.tenantId},
          ${auth.domainUser.id},
          ${sourceId},
          ${body.name ?? source[0].name},
          ${body.description ?? source[0].description},
          ${body.instructions ?? source[0].instructions},
          ${body.primaryMuscleGroupId === undefined ? source[0].primary_muscle_group_id : body.primaryMuscleGroupId},
          ${body.equipmentId === undefined ? source[0].equipment_id : body.equipmentId},
          ${body.videoMediaId === undefined ? source[0].video_media_id : body.videoMediaId},
          ${body.secondaryMuscleGroupIds ?? secondary.map((s) => s.muscle_group_id)}
        )
      `;
      return reply.code(201).send({
        id: created[0]?.exercise_id,
        revisionId: created[0]?.revision_id,
        basedOnExerciseId: sourceId,
      });
    } catch (error) {
      request.log.error(error);
      return reply.code(400).send({ error: 'customize_failed' });
    }
  });

  app.patch('/v1/exercises/:id', async (request, reply) => {
    const auth = await resolveAuthContext(request, opts.auths, opts.appSql);
    if (!auth?.membership || auth.membership.role !== 'owner') {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const id = (request.params as { id: string }).id;
    const parsed = ExerciseBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });

    try {
      const revisionId = await opts.appSql<{ append_exercise_revision: string }[]>`
        SELECT app.append_exercise_revision(
          ${id},
          ${auth.membership.tenantId},
          ${auth.domainUser.id},
          ${parsed.data.name},
          ${parsed.data.description},
          ${parsed.data.instructions},
          ${parsed.data.primaryMuscleGroupId ?? null},
          ${parsed.data.equipmentId ?? null},
          ${parsed.data.videoMediaId ?? null},
          ${parsed.data.secondaryMuscleGroupIds}
        )
      `;
      return {
        id,
        revisionId: revisionId[0]?.append_exercise_revision,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('exercise_not_editable')) {
        return reply.code(403).send({ error: 'exercise_not_editable' });
      }
      request.log.error(error);
      return reply.code(400).send({ error: 'update_failed' });
    }
  });

  app.post('/v1/exercises/:id/archive', async (request, reply) => {
    const auth = await resolveAuthContext(request, opts.auths, opts.appSql);
    if (!auth?.membership || auth.membership.role !== 'owner') {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const id = (request.params as { id: string }).id;
    const updated = await withTenantContext(
      opts.appSql,
      {
        realm: auth.realm,
        userId: auth.domainUser.id,
        tenantId: auth.membership.tenantId,
        membershipId: auth.membership.id,
        role: 'owner',
      },
      async (tx) =>
        tx<{ id: string }[]>`
          UPDATE exercises
          SET archived_at = now(), updated_at = now()
          WHERE id = ${id}
            AND tenant_id = ${auth.membership!.tenantId}
            AND archived_at IS NULL
          RETURNING id
        `,
    );
    if (!updated[0]) return reply.code(404).send({ error: 'not_found' });
    return { id: updated[0].id, status: 'archived' };
  });
}
