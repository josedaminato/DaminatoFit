import * as Network from 'expo-network';
import { getStudentRoutine } from '@/features/routines/routine-api';
import type { StudentRoutineDetail } from '@/features/routines/types';
import type { ApiRequestContext } from '@/lib/api-client';
import { cacheRoutine, readCachedRoutine } from './local-db';

export async function loadStudentRoutineWithCache(
  ctx: ApiRequestContext,
  planId: string,
): Promise<{ routine: StudentRoutineDetail; fromCache: boolean }> {
  const net = await Network.getNetworkStateAsync();
  const online = net.isConnected && net.isInternetReachable !== false;

  if (online) {
    try {
      const routine = await getStudentRoutine(ctx, planId);
      await cacheRoutine(planId, routine);
      return { routine, fromCache: false };
    } catch {
      const cached = await readCachedRoutine(planId);
      if (cached) return { routine: cached, fromCache: true };
      throw new Error('routine_load_failed');
    }
  }

  const cached = await readCachedRoutine(planId);
  if (!cached) throw new Error('routine_offline_missing');
  return { routine: cached, fromCache: true };
}
