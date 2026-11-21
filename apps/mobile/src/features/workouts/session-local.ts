import type { RoutineDay } from '@/features/routines/types';
import {
  getLocalSessionByClientId,
  listSetLogsForSession,
  upsertLocalSession,
  upsertLocalSetLog,
  type LocalSetRow,
} from './local-db';
import { isoNow, newWorkoutClientId } from './types';

export async function seedSetLogsFromDay(
  sessionClientId: string,
  day: RoutineDay,
): Promise<LocalSetRow[]> {
  const now = isoNow();
  let position = 0;
  for (const ex of [...day.exercises].sort((a, b) => a.position - b.position)) {
    for (const set of [...ex.sets].sort((a, b) => a.position - b.position)) {
      const clientId = newWorkoutClientId();
      await upsertLocalSetLog({
        clientId,
        sessionClientId,
        exerciseId: ex.exerciseId,
        routineVersionSetId: set.id,
        position,
        prescribedRepsMin: set.targetRepsMin,
        prescribedRepsMax: set.targetRepsMax,
        prescribedWeightKg: set.targetWeightKg,
        loggedAt: now,
        clientUpdatedAt: now,
        dirty: 1,
      });
      position += 1;
    }
  }
  return listSetLogsForSession(sessionClientId);
}

export async function startLocalSession(input: {
  membershipId: string;
  tenantId: string;
  routineVersionId: string;
  dayId: string;
  clientId?: string;
  notes?: string;
}): Promise<string> {
  const clientId = input.clientId ?? newWorkoutClientId();
  const startedAt = isoNow();
  await upsertLocalSession({
    clientId,
    membershipId: input.membershipId,
    tenantId: input.tenantId,
    routineVersionId: input.routineVersionId,
    dayId: input.dayId,
    status: 'in_progress',
    startedAt,
    notes: input.notes ?? '',
    dirty: 1,
  });
  return clientId;
}

export async function finishLocalSession(
  clientId: string,
  status: 'completed' | 'abandoned',
  notes?: string,
): Promise<void> {
  const row = await getLocalSessionByClientId(clientId);
  if (!row) return;
  await upsertLocalSession({
    clientId,
    serverId: row.server_id,
    membershipId: row.membership_id,
    tenantId: row.tenant_id,
    routineVersionId: row.routine_version_id,
    dayId: row.day_id,
    status,
    startedAt: row.started_at,
    finishedAt: isoNow(),
    notes: notes ?? row.notes,
    dirty: 1,
  });
}

export async function completeLocalSet(input: {
  clientId: string;
  sessionClientId: string;
  exerciseId: string;
  routineVersionSetId: string | null;
  position: number;
  prescribedRepsMin: number | null;
  prescribedRepsMax: number | null;
  prescribedWeightKg: number | null;
  actualReps: number | null;
  actualWeightKg: number | null;
  serverId?: string | null;
}): Promise<void> {
  const now = isoNow();
  await upsertLocalSetLog({
    ...input,
    completed: true,
    notes: '',
    loggedAt: now,
    clientUpdatedAt: now,
    dirty: 1,
  });
  const session = await getLocalSessionByClientId(input.sessionClientId);
  if (session) {
    await upsertLocalSession({
      clientId: session.client_id,
      serverId: session.server_id,
      membershipId: session.membership_id,
      tenantId: session.tenant_id,
      routineVersionId: session.routine_version_id,
      dayId: session.day_id,
      status: session.status,
      startedAt: session.started_at,
      finishedAt: session.finished_at,
      notes: session.notes,
      dirty: 1,
    });
  }
}
