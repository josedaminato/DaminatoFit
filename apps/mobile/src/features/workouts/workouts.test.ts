import {
  applySessionIdMap,
  buildSyncSessionsPayload,
  buildSyncSetsPayload,
  mergeSessionServerIds,
} from './sync-helpers';
import {
  clearRestTimer,
  formatRestCountdown,
  getRemainingMs,
  pauseTimer,
  resumeTimer,
  startRestTimer,
} from './rest-timer';
import { setVolumeKg, sparklinePointsForExercise } from './progress-math';
import { validateSetInputs } from './set-validation';
import type { LocalSessionRow, LocalSetRow } from './local-db';

const sessionRow = (overrides: Partial<LocalSessionRow> = {}): LocalSessionRow => ({
  client_id: '11111111-1111-4111-8111-111111111111',
  server_id: null,
  membership_id: 'm1',
  tenant_id: 't1',
  routine_version_id: '22222222-2222-4222-8222-222222222222',
  day_id: '33333333-3333-4333-8333-333333333333',
  status: 'in_progress',
  started_at: '2026-01-01T12:00:00.000Z',
  finished_at: null,
  notes: '',
  dirty: 1,
  ...overrides,
});

const setRow = (overrides: Partial<LocalSetRow> = {}): LocalSetRow => ({
  client_id: '44444444-4444-4444-8444-444444444444',
  session_client_id: '11111111-1111-4111-8111-111111111111',
  server_id: null,
  exercise_id: '55555555-5555-4555-8555-555555555555',
  routine_version_set_id: null,
  position: 0,
  prescribed_reps_min: 8,
  prescribed_reps_max: 12,
  prescribed_weight_kg: 40,
  actual_reps: 10,
  actual_weight_kg: 42.5,
  completed: 1,
  notes: '',
  logged_at: '2026-01-01T12:05:00.000Z',
  client_updated_at: '2026-01-01T12:05:00.000Z',
  dirty: 1,
  ...overrides,
});

describe('workouts sync helpers', () => {
  it('dedupes sessions by client id in payload', () => {
    const rows = [sessionRow(), sessionRow({ notes: 'dup' })];
    const payload = buildSyncSessionsPayload(rows);
    expect(payload).toHaveLength(1);
    expect(payload[0]?.clientId).toBe(sessionRow().client_id);
  });

  it('merges session server ids idempotently', () => {
    const results = [{ clientId: sessionRow().client_id, sessionId: 'srv-1' }];
    const mapA = mergeSessionServerIds(results);
    const mapB = applySessionIdMap(mapA, mergeSessionServerIds(results));
    expect(mapA.get(sessionRow().client_id)).toBe('srv-1');
    expect(mapB.get(sessionRow().client_id)).toBe('srv-1');
  });

  it('builds set sync payload with sessionClientId', () => {
    const payload = buildSyncSetsPayload([setRow(), setRow({ client_id: 'other', position: 1 })]);
    expect(payload).toHaveLength(2);
    expect(payload[0]?.sessionClientId).toBe(setRow().session_client_id);
    expect(payload[0]?.completed).toBe(true);
  });
});

describe('rest timer', () => {
  const t0 = 1_700_000_000_000;

  it('computes remaining from endsAt after background', () => {
    const state = startRestTimer(90, t0);
    expect(getRemainingMs(state, t0 + 30_000)).toBe(60_000);
  });

  it('pause stores remaining and resume recalculates endsAt', () => {
    const running = startRestTimer(60, t0);
    const paused = pauseTimer(running, t0 + 10_000);
    expect(getRemainingMs(paused, t0 + 99_000)).toBe(50_000);
    const resumed = resumeTimer(paused, t0 + 20_000);
    expect(getRemainingMs(resumed, t0 + 20_000)).toBe(50_000);
    expect(resumed.endsAt).toBe(t0 + 70_000);
  });

  it('formats countdown', () => {
    expect(formatRestCountdown(125_000)).toBe('2:05');
    expect(getRemainingMs(clearRestTimer())).toBe(0);
  });
});

describe('progress math', () => {
  it('volume is reps times weight', () => {
    expect(setVolumeKg(10, 50)).toBe(500);
    expect(setVolumeKg(-1, 50)).toBe(0);
  });

  it('builds sparkline points for one exercise', () => {
    const points = sparklinePointsForExercise(
      [
        { exerciseId: 'ex1', loggedAt: 'a', weightKg: 40, reps: 8, sessionId: 's1' },
        { exerciseId: 'ex1', loggedAt: 'b', weightKg: 50, reps: 6, sessionId: 's2' },
        { exerciseId: 'ex2', loggedAt: 'c', weightKg: 20, reps: 10, sessionId: 's3' },
      ],
      'ex1',
    );
    expect(points).toHaveLength(2);
    expect(points[1]?.weightKg).toBe(50);
  });
});

describe('set validation', () => {
  it('rejects negative values', () => {
    expect(validateSetInputs({ actualReps: -1, actualWeightKg: 10 })).toMatch(/repeticiones/i);
    expect(validateSetInputs({ actualReps: 8, actualWeightKg: -5 })).toMatch(/negativo/i);
    expect(validateSetInputs({ actualReps: 8, actualWeightKg: 40 })).toBeNull();
  });
});
