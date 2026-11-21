import { fetchJson, type ApiRequestContext } from '@/lib/api-client';
import type {
  SetUpsertInput,
  StudentProgressPayload,
  SyncSessionInput,
  SyncSetInput,
  WorkoutSession,
  WorkoutSetLog,
} from './types';

export async function startWorkoutSession(
  ctx: ApiRequestContext,
  body: {
    clientId: string;
    routineVersionId: string;
    routineVersionDayId: string;
    startedAt?: string;
    notes?: string;
  },
): Promise<{ session: WorkoutSession }> {
  return fetchJson(ctx, '/v1/workouts/sessions', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function listWorkoutSessions(
  ctx: ApiRequestContext,
  params?: { status?: string; limit?: number },
): Promise<{ sessions: WorkoutSession[] }> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.limit) qs.set('limit', String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return fetchJson(ctx, `/v1/workouts/sessions${suffix}`);
}

export async function getActiveWorkoutSession(
  ctx: ApiRequestContext,
): Promise<{ active: { session: WorkoutSession; sets: WorkoutSetLog[] } | null }> {
  return fetchJson(ctx, '/v1/workouts/sessions/active');
}

export async function getWorkoutSession(
  ctx: ApiRequestContext,
  sessionId: string,
): Promise<{ session: WorkoutSession; sets: WorkoutSetLog[] }> {
  return fetchJson(ctx, `/v1/workouts/sessions/${sessionId}`);
}

export async function putWorkoutSessionSets(
  ctx: ApiRequestContext,
  sessionId: string,
  sets: SetUpsertInput[],
): Promise<{ results: unknown[] }> {
  return fetchJson(ctx, `/v1/workouts/sessions/${sessionId}/sets`, {
    method: 'PUT',
    body: JSON.stringify({ sets }),
  });
}

export async function finishWorkoutSession(
  ctx: ApiRequestContext,
  sessionId: string,
  body: { status: 'completed' | 'abandoned'; finishedAt?: string; notes?: string },
): Promise<{ id: string; status: string }> {
  return fetchJson(ctx, `/v1/workouts/sessions/${sessionId}/finish`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export interface SyncWorkoutResponse {
  sessions: { clientId: string; sessionId: string; error?: string }[];
  sets: {
    clientId: string;
    setLogId?: string;
    applied?: boolean;
    reason?: string;
    error?: string;
  }[];
}

export async function syncWorkouts(
  ctx: ApiRequestContext,
  body: { sessions: SyncSessionInput[]; sets: SyncSetInput[] },
): Promise<SyncWorkoutResponse> {
  return fetchJson(ctx, '/v1/workouts/sync', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function getStudentProgress(
  ctx: ApiRequestContext,
): Promise<{ progress: StudentProgressPayload }> {
  return fetchJson(ctx, '/v1/student/progress');
}

export async function listTrainerStudentWorkouts(
  ctx: ApiRequestContext,
  membershipId: string,
): Promise<{ sessions: WorkoutSession[] }> {
  return fetchJson(ctx, `/v1/trainer/students/${membershipId}/workouts`);
}

export async function getTrainerStudentProgress(
  ctx: ApiRequestContext,
  membershipId: string,
): Promise<{ progress: StudentProgressPayload }> {
  return fetchJson(ctx, `/v1/trainer/students/${membershipId}/progress`);
}
