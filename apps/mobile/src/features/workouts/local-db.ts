import * as SQLite from 'expo-sqlite';
import type { StudentRoutineDetail } from '@/features/routines/types';
import type { WorkoutSessionStatus } from './types';

const DB_NAME = 'daminatofit_workouts_v1';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

const SCHEMA = `
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS cached_routines (
  plan_id TEXT PRIMARY KEY NOT NULL,
  json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS local_sessions (
  client_id TEXT PRIMARY KEY NOT NULL,
  server_id TEXT,
  membership_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  routine_version_id TEXT NOT NULL,
  day_id TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  notes TEXT NOT NULL DEFAULT '',
  dirty INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS local_set_logs (
  client_id TEXT PRIMARY KEY NOT NULL,
  session_client_id TEXT NOT NULL,
  server_id TEXT,
  exercise_id TEXT NOT NULL,
  routine_version_set_id TEXT,
  position INTEGER NOT NULL,
  prescribed_reps_min INTEGER,
  prescribed_reps_max INTEGER,
  prescribed_weight_kg REAL,
  actual_reps INTEGER,
  actual_weight_kg REAL,
  completed INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  logged_at TEXT NOT NULL,
  client_updated_at TEXT NOT NULL,
  dirty INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_local_set_logs_session ON local_set_logs(session_client_id);
CREATE TABLE IF NOT EXISTS sync_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL
);
`;

export async function getWorkoutDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync(SCHEMA);
      return db;
    })();
  }
  return dbPromise;
}

export interface LocalSessionRow {
  client_id: string;
  server_id: string | null;
  membership_id: string;
  tenant_id: string;
  routine_version_id: string;
  day_id: string;
  status: WorkoutSessionStatus;
  started_at: string;
  finished_at: string | null;
  notes: string;
  dirty: number;
}

export interface LocalSetRow {
  client_id: string;
  session_client_id: string;
  server_id: string | null;
  exercise_id: string;
  routine_version_set_id: string | null;
  position: number;
  prescribed_reps_min: number | null;
  prescribed_reps_max: number | null;
  prescribed_weight_kg: number | null;
  actual_reps: number | null;
  actual_weight_kg: number | null;
  completed: number;
  notes: string;
  logged_at: string;
  client_updated_at: string;
  dirty: number;
}

export async function cacheRoutine(planId: string, routine: StudentRoutineDetail): Promise<void> {
  const db = await getWorkoutDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO cached_routines (plan_id, json, updated_at) VALUES (?, ?, ?)`,
    planId,
    JSON.stringify(routine),
    new Date().toISOString(),
  );
}

export async function readCachedRoutine(planId: string): Promise<StudentRoutineDetail | null> {
  const db = await getWorkoutDb();
  const row = await db.getFirstAsync<{ json: string }>(
    `SELECT json FROM cached_routines WHERE plan_id = ?`,
    planId,
  );
  if (!row?.json) return null;
  try {
    return JSON.parse(row.json) as StudentRoutineDetail;
  } catch {
    return null;
  }
}

export async function upsertLocalSession(input: {
  clientId: string;
  serverId?: string | null;
  membershipId: string;
  tenantId: string;
  routineVersionId: string;
  dayId: string;
  status: WorkoutSessionStatus;
  startedAt: string;
  finishedAt?: string | null;
  notes?: string;
  dirty?: number;
}): Promise<void> {
  const db = await getWorkoutDb();
  await db.runAsync(
    `INSERT INTO local_sessions (
      client_id, server_id, membership_id, tenant_id, routine_version_id, day_id,
      status, started_at, finished_at, notes, dirty
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(client_id) DO UPDATE SET
      server_id = coalesce(excluded.server_id, local_sessions.server_id),
      status = excluded.status,
      finished_at = excluded.finished_at,
      notes = excluded.notes,
      dirty = excluded.dirty`,
    input.clientId,
    input.serverId ?? null,
    input.membershipId,
    input.tenantId,
    input.routineVersionId,
    input.dayId,
    input.status,
    input.startedAt,
    input.finishedAt ?? null,
    input.notes ?? '',
    input.dirty ?? 1,
  );
}

export async function getLocalSessionByClientId(clientId: string): Promise<LocalSessionRow | null> {
  const db = await getWorkoutDb();
  return (
    (await db.getFirstAsync<LocalSessionRow>(
      `SELECT * FROM local_sessions WHERE client_id = ?`,
      clientId,
    )) ?? null
  );
}

export async function getActiveLocalSession(
  membershipId: string,
  tenantId: string,
): Promise<LocalSessionRow | null> {
  const db = await getWorkoutDb();
  return (
    (await db.getFirstAsync<LocalSessionRow>(
      `SELECT * FROM local_sessions
       WHERE membership_id = ? AND tenant_id = ? AND status = 'in_progress'
       ORDER BY started_at DESC LIMIT 1`,
      membershipId,
      tenantId,
    )) ?? null
  );
}

export async function listDirtySessions(
  membershipId: string,
  tenantId: string,
): Promise<LocalSessionRow[]> {
  const db = await getWorkoutDb();
  return db.getAllAsync<LocalSessionRow>(
    `SELECT * FROM local_sessions WHERE membership_id = ? AND tenant_id = ? AND dirty = 1`,
    membershipId,
    tenantId,
  );
}

export async function markSessionClean(clientId: string, serverId?: string | null): Promise<void> {
  const db = await getWorkoutDb();
  await db.runAsync(
    `UPDATE local_sessions SET dirty = 0, server_id = coalesce(?, server_id) WHERE client_id = ?`,
    serverId ?? null,
    clientId,
  );
}

export async function upsertLocalSetLog(input: {
  clientId: string;
  sessionClientId: string;
  serverId?: string | null;
  exerciseId: string;
  routineVersionSetId?: string | null;
  position: number;
  prescribedRepsMin?: number | null;
  prescribedRepsMax?: number | null;
  prescribedWeightKg?: number | null;
  actualReps?: number | null;
  actualWeightKg?: number | null;
  completed?: boolean;
  notes?: string;
  loggedAt: string;
  clientUpdatedAt: string;
  dirty?: number;
}): Promise<void> {
  const db = await getWorkoutDb();
  await db.runAsync(
    `INSERT INTO local_set_logs (
      client_id, session_client_id, server_id, exercise_id, routine_version_set_id, position,
      prescribed_reps_min, prescribed_reps_max, prescribed_weight_kg,
      actual_reps, actual_weight_kg, completed, notes, logged_at, client_updated_at, dirty
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(client_id) DO UPDATE SET
      server_id = coalesce(excluded.server_id, local_set_logs.server_id),
      actual_reps = excluded.actual_reps,
      actual_weight_kg = excluded.actual_weight_kg,
      completed = excluded.completed,
      notes = excluded.notes,
      logged_at = excluded.logged_at,
      client_updated_at = excluded.client_updated_at,
      dirty = excluded.dirty`,
    input.clientId,
    input.sessionClientId,
    input.serverId ?? null,
    input.exerciseId,
    input.routineVersionSetId ?? null,
    input.position,
    input.prescribedRepsMin ?? null,
    input.prescribedRepsMax ?? null,
    input.prescribedWeightKg ?? null,
    input.actualReps ?? null,
    input.actualWeightKg ?? null,
    input.completed ? 1 : 0,
    input.notes ?? '',
    input.loggedAt,
    input.clientUpdatedAt,
    input.dirty ?? 1,
  );
}

export async function listSetLogsForSession(sessionClientId: string): Promise<LocalSetRow[]> {
  const db = await getWorkoutDb();
  return db.getAllAsync<LocalSetRow>(
    `SELECT * FROM local_set_logs WHERE session_client_id = ? ORDER BY position, logged_at`,
    sessionClientId,
  );
}

export async function listDirtySetLogs(
  membershipId: string,
  tenantId: string,
): Promise<LocalSetRow[]> {
  const db = await getWorkoutDb();
  return db.getAllAsync<LocalSetRow>(
    `SELECT l.* FROM local_set_logs l
     INNER JOIN local_sessions s ON s.client_id = l.session_client_id
     WHERE s.membership_id = ? AND s.tenant_id = ? AND l.dirty = 1`,
    membershipId,
    tenantId,
  );
}

export async function markSetClean(clientId: string, serverId?: string | null): Promise<void> {
  const db = await getWorkoutDb();
  await db.runAsync(
    `UPDATE local_set_logs SET dirty = 0, server_id = coalesce(?, server_id) WHERE client_id = ?`,
    serverId ?? null,
    clientId,
  );
}

export async function countPendingSync(membershipId: string, tenantId: string): Promise<number> {
  const db = await getWorkoutDb();
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT (
      (SELECT count(*) FROM local_sessions WHERE membership_id = ? AND tenant_id = ? AND dirty = 1)
      +
      (SELECT count(*) FROM local_set_logs l
        INNER JOIN local_sessions s ON s.client_id = l.session_client_id
        WHERE s.membership_id = ? AND s.tenant_id = ? AND l.dirty = 1)
    ) AS n`,
    membershipId,
    tenantId,
    membershipId,
    tenantId,
  );
  return row?.n ?? 0;
}
