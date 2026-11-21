import * as Network from 'expo-network';
import type { ApiRequestContext } from '@/lib/api-client';
import {
  countPendingSync,
  listDirtySessions,
  listDirtySetLogs,
  markSessionClean,
  markSetClean,
} from './local-db';
import {
  applySessionIdMap,
  buildSyncSessionsPayload,
  buildSyncSetsPayload,
  isStaleSyncSetError,
  mergeSessionServerIds,
} from './sync-helpers';
import { syncWorkouts } from './workout-api';

export async function pendingCount(membershipId: string, tenantId: string): Promise<number> {
  return countPendingSync(membershipId, tenantId);
}

export async function syncNow(
  ctx: ApiRequestContext,
  membershipId: string,
  tenantId: string,
): Promise<{ ok: boolean; pending: number; error?: string }> {
  const state = await Network.getNetworkStateAsync();
  if (!state.isConnected || state.isInternetReachable === false) {
    const pending = await pendingCount(membershipId, tenantId);
    return { ok: false, pending, error: 'offline' };
  }

  const dirtySessions = await listDirtySessions(membershipId, tenantId);
  const dirtySets = await listDirtySetLogs(membershipId, tenantId);
  if (dirtySessions.length === 0 && dirtySets.length === 0) {
    return { ok: true, pending: 0 };
  }

  try {
    const response = await syncWorkouts(ctx, {
      sessions: buildSyncSessionsPayload(dirtySessions),
      sets: buildSyncSetsPayload(dirtySets),
    });

    const sessionIds = mergeSessionServerIds(response.sessions);
    let idMap = new Map<string, string>();
    for (const s of dirtySessions) {
      if (s.server_id) idMap.set(s.client_id, s.server_id);
    }
    idMap = applySessionIdMap(idMap, sessionIds);

    for (const result of response.sessions) {
      if (result.error === 'active_session_exists') continue;
      if (!result.error && result.sessionId) {
        await markSessionClean(result.clientId, result.sessionId);
      }
    }

    for (const setResult of response.sets) {
      if (setResult.error && !isStaleSyncSetError(setResult.error)) continue;
      if (isStaleSyncSetError(setResult.error)) {
        await markSetClean(setResult.clientId);
        continue;
      }
      if (setResult.setLogId || setResult.applied !== false) {
        await markSetClean(setResult.clientId, setResult.setLogId);
      }
    }

    for (const session of dirtySessions) {
      if (sessionIds.has(session.client_id)) {
        await markSessionClean(session.client_id, sessionIds.get(session.client_id));
      }
    }

    const pending = await pendingCount(membershipId, tenantId);
    return { ok: true, pending };
  } catch {
    const pending = await pendingCount(membershipId, tenantId);
    return { ok: false, pending, error: 'sync_failed' };
  }
}
