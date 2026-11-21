import type { ApiRequestContext } from '@/lib/api-client';
import { fetchJson } from '@/lib/api-client';
import type {
  EquipmentItem,
  Exercise,
  ExerciseListScope,
  ExerciseWriteBody,
  MuscleGroup,
  PlaybackUrlResponse,
} from './types';

export interface ListExercisesParams {
  scope?: ExerciseListScope;
  q?: string;
  muscle?: string;
}

/** Builds the exercises list path (unit-tested for search/filter query params). */
export function buildExercisesListPath(params: ListExercisesParams = {}): string {
  const search = new URLSearchParams();
  if (params.scope) search.set('scope', params.scope);
  if (params.q?.trim()) search.set('q', params.q.trim());
  if (params.muscle?.trim()) search.set('muscle', params.muscle.trim());
  const query = search.toString();
  return query ? `/v1/exercises?${query}` : '/v1/exercises';
}

export async function listExercises(
  ctx: ApiRequestContext,
  params: ListExercisesParams = {},
): Promise<Exercise[]> {
  const res = await fetchJson<{ exercises: Exercise[] }>(ctx, buildExercisesListPath(params));
  return res.exercises;
}

export async function getExercise(ctx: ApiRequestContext, id: string): Promise<Exercise> {
  const res = await fetchJson<{ exercise: Exercise }>(ctx, `/v1/exercises/${id}`);
  return res.exercise;
}

export async function createExercise(
  ctx: ApiRequestContext,
  body: ExerciseWriteBody,
): Promise<{ id: string; revisionId: string }> {
  return fetchJson(ctx, '/v1/exercises', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateExercise(
  ctx: ApiRequestContext,
  id: string,
  body: ExerciseWriteBody,
): Promise<{ id: string; revisionId: string }> {
  return fetchJson(ctx, `/v1/exercises/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export type CustomizeExerciseBody = Partial<
  Pick<
    ExerciseWriteBody,
    | 'name'
    | 'description'
    | 'instructions'
    | 'primaryMuscleGroupId'
    | 'secondaryMuscleGroupIds'
    | 'equipmentId'
    | 'videoMediaId'
  >
>;

export async function customizeExercise(
  ctx: ApiRequestContext,
  globalExerciseId: string,
  body: CustomizeExerciseBody,
): Promise<{ id: string; revisionId: string; basedOnExerciseId: string }> {
  return fetchJson(ctx, `/v1/exercises/${globalExerciseId}/customize`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function archiveExercise(
  ctx: ApiRequestContext,
  id: string,
): Promise<{ id: string; status: string }> {
  return fetchJson(ctx, `/v1/exercises/${id}/archive`, { method: 'POST' });
}

export async function listMuscleGroups(ctx: ApiRequestContext): Promise<MuscleGroup[]> {
  const res = await fetchJson<{ muscleGroups: MuscleGroup[] }>(ctx, '/v1/muscle-groups');
  return res.muscleGroups;
}

export async function listEquipment(ctx: ApiRequestContext): Promise<EquipmentItem[]> {
  const res = await fetchJson<{ equipment: EquipmentItem[] }>(ctx, '/v1/equipment');
  return res.equipment;
}

export async function getPlaybackUrl(
  ctx: ApiRequestContext,
  mediaId: string,
): Promise<PlaybackUrlResponse> {
  return fetchJson(ctx, `/v1/media/${mediaId}/playback-url`);
}

export type VideoContentType = 'video/mp4' | 'video/quicktime';

export function normalizeVideoContentType(
  mime: string | null | undefined,
): VideoContentType | null {
  if (mime === 'video/mp4') return 'video/mp4';
  if (mime === 'video/quicktime' || mime === 'video/mov') return 'video/quicktime';
  return null;
}

export async function uploadExerciseVideo(
  ctx: ApiRequestContext,
  localUri: string,
  contentType: VideoContentType,
  declaredSizeBytes: number,
): Promise<string> {
  const { assetId, uploadUrl } = await fetchJson<{ assetId: string; uploadUrl: string }>(
    ctx,
    '/v1/media/uploads',
    {
      method: 'POST',
      body: JSON.stringify({ contentType, declaredSizeBytes }),
    },
  );

  const fileResponse = await fetch(localUri);
  const blob = await fileResponse.blob();
  const putResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: blob,
  });
  if (!putResponse.ok) {
    throw new Error('upload_failed');
  }

  await fetchJson(ctx, `/v1/media/${assetId}/confirm`, { method: 'POST' });
  return assetId;
}
