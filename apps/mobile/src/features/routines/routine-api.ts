import type { ApiRequestContext } from '@/lib/api-client';
import { fetchJson } from '@/lib/api-client';
import type {
  DraftWriteBody,
  RoutineAssignmentRow,
  RoutineDetail,
  RoutineKind,
  RoutineListItem,
  RoutineStatus,
  StudentRoutineDetail,
  StudentRoutineListItem,
} from './types';

export interface ListRoutinesParams {
  kind?: RoutineKind;
  status?: RoutineStatus;
}

export function buildRoutinesListPath(params: ListRoutinesParams = {}): string {
  const search = new URLSearchParams();
  const kind = params.kind ?? 'template';
  const status = params.status ?? 'active';
  search.set('kind', kind);
  search.set('status', status);
  return `/v1/routines?${search.toString()}`;
}

export async function listRoutines(
  ctx: ApiRequestContext,
  params: ListRoutinesParams = {},
): Promise<RoutineListItem[]> {
  const res = await fetchJson<{ routines: RoutineListItem[] }>(ctx, buildRoutinesListPath(params));
  return res.routines;
}

export async function createRoutine(
  ctx: ApiRequestContext,
  body: { name: string; description?: string },
): Promise<{ id: string; draftVersionId: string }> {
  return fetchJson(ctx, '/v1/routines', {
    method: 'POST',
    body: JSON.stringify({
      name: body.name,
      description: body.description ?? '',
    }),
  });
}

export async function getRoutine(ctx: ApiRequestContext, id: string): Promise<RoutineDetail> {
  const res = await fetchJson<{ routine: RoutineDetail }>(ctx, `/v1/routines/${id}`);
  return res.routine;
}

export async function saveRoutineDraft(
  ctx: ApiRequestContext,
  id: string,
  body: DraftWriteBody,
): Promise<{ draftVersionId: string; status: string }> {
  return fetchJson(ctx, `/v1/routines/${id}/draft`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function publishRoutine(
  ctx: ApiRequestContext,
  id: string,
  body?: { changeNote?: string; startsOn?: string; endsOn?: string | null },
): Promise<{ versionId: string; status: string }> {
  return fetchJson(ctx, `/v1/routines/${id}/publish`, {
    method: 'POST',
    body: JSON.stringify(body ?? {}),
  });
}

export async function ensureNewRoutineDraft(
  ctx: ApiRequestContext,
  id: string,
): Promise<{ draftVersionId: string }> {
  return fetchJson(ctx, `/v1/routines/${id}/new-draft`, { method: 'POST' });
}

export async function duplicateRoutine(
  ctx: ApiRequestContext,
  id: string,
): Promise<{ id: string; draftVersionId: string }> {
  return fetchJson(ctx, `/v1/routines/${id}/duplicate`, { method: 'POST' });
}

export async function archiveRoutine(
  ctx: ApiRequestContext,
  id: string,
): Promise<{ id: string; status: string }> {
  return fetchJson(ctx, `/v1/routines/${id}/archive`, { method: 'POST' });
}

export interface AssignRoutineBody {
  studentMembershipIds: string[];
  startsOn?: string;
  endsOn?: string | null;
  replaceActive?: boolean;
}

export async function assignRoutine(
  ctx: ApiRequestContext,
  templateId: string,
  body: AssignRoutineBody,
): Promise<{ assignedPlanIds: string[] }> {
  return fetchJson(ctx, `/v1/routines/${templateId}/assign`, {
    method: 'POST',
    body: JSON.stringify({
      replaceActive: true,
      ...body,
    }),
  });
}

export async function listRoutineAssignments(
  ctx: ApiRequestContext,
  templateId: string,
): Promise<RoutineAssignmentRow[]> {
  const res = await fetchJson<{ assignments: RoutineAssignmentRow[] }>(
    ctx,
    `/v1/routines/${templateId}/assignments`,
  );
  return res.assignments;
}

export async function listStudentRoutines(
  ctx: ApiRequestContext,
): Promise<StudentRoutineListItem[]> {
  const res = await fetchJson<{ routines: StudentRoutineListItem[] }>(ctx, '/v1/student/routines');
  return res.routines;
}

export async function getStudentRoutine(
  ctx: ApiRequestContext,
  id: string,
): Promise<StudentRoutineDetail> {
  const res = await fetchJson<{ routine: StudentRoutineDetail }>(ctx, `/v1/student/routines/${id}`);
  return res.routine;
}
