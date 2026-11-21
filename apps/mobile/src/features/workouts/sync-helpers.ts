import type { LocalSessionRow, LocalSetRow } from './local-db';
import type { SyncSessionInput, SyncSetInput } from './types';

export function buildSyncSessionsPayload(sessions: LocalSessionRow[]): SyncSessionInput[] {
  const byClient = new Map<string, SyncSessionInput>();
  for (const s of sessions) {
    byClient.set(s.client_id, {
      clientId: s.client_id,
      routineVersionId: s.routine_version_id,
      routineVersionDayId: s.day_id,
      startedAt: s.started_at,
      notes: s.notes,
      status: s.status,
      finishedAt: s.finished_at,
    });
  }
  return [...byClient.values()];
}

export function buildSyncSetsPayload(sets: LocalSetRow[]): SyncSetInput[] {
  const byClient = new Map<string, SyncSetInput>();
  for (const row of sets) {
    byClient.set(row.client_id, {
      sessionClientId: row.session_client_id,
      clientId: row.client_id,
      exerciseId: row.exercise_id,
      routineVersionSetId: row.routine_version_set_id,
      position: row.position,
      prescribedRepsMin: row.prescribed_reps_min,
      prescribedRepsMax: row.prescribed_reps_max,
      prescribedWeightKg: row.prescribed_weight_kg,
      actualReps: row.actual_reps,
      actualWeightKg: row.actual_weight_kg,
      completed: row.completed === 1,
      notes: row.notes,
      loggedAt: row.logged_at,
      clientUpdatedAt: row.client_updated_at,
    });
  }
  return [...byClient.values()];
}

export function isStaleSyncSetError(error?: string): boolean {
  return error === 'session_not_editable' || error === 'session_missing';
}

export function mergeSessionServerIds(
  results: { clientId: string; sessionId: string; error?: string }[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of results) {
    if (r.sessionId && !r.error) map.set(r.clientId, r.sessionId);
  }
  return map;
}

/** Idempotent: applying the same server mapping twice yields the same map. */
export function applySessionIdMap(
  existing: Map<string, string>,
  patch: Map<string, string>,
): Map<string, string> {
  const next = new Map(existing);
  for (const [k, v] of patch) next.set(k, v);
  return next;
}
