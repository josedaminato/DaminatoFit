import { EXERCISE_VIDEO_SHOULD_AUTOPLAY } from '@/features/exercises/types';
import { buildRoutinesListPath } from './routine-api';
import {
  ROUTINE_VIDEO_SHOULD_AUTOPLAY,
  duplicateDayInDraft,
  emptyDay,
  moveDayInWeek,
  routineKindLabel,
  validateDraft,
} from './types';

describe('routines UI helpers', () => {
  it('builds list query for kind and status', () => {
    expect(buildRoutinesListPath()).toBe('/v1/routines?kind=template&status=active');
    expect(buildRoutinesListPath({ kind: 'assigned', status: 'archived' })).toBe(
      '/v1/routines?kind=assigned&status=archived',
    );
  });

  it('labels template vs assigned', () => {
    expect(routineKindLabel('template')).toBe('Plantilla');
    expect(routineKindLabel('assigned')).toBe('Asignada');
  });

  it('validates draft metadata and sets', () => {
    expect(
      validateDraft({
        name: '',
        description: '',
        changeNote: '',
        days: [emptyDay(0)],
      }),
    ).toMatch(/nombre/i);

    const valid = validateDraft({
      name: 'Fuerza base',
      description: 'ok',
      changeNote: '',
      days: [
        {
          ...emptyDay(0),
          exercises: [
            {
              clientKey: 'ex1',
              exerciseId: '00000000-0000-4000-8000-000000000001',
              exerciseName: 'Sentadilla',
              instructions: '',
              videoMediaId: null,
              position: 0,
              notes: '',
              restSeconds: 60,
              sets: [
                {
                  clientKey: 's1',
                  position: 0,
                  targetRepsMin: 8,
                  targetRepsMax: 12,
                  targetWeightKg: 40,
                  restSeconds: 90,
                },
              ],
            },
          ],
        },
      ],
    });
    expect(valid).toBeNull();

    const badReps = validateDraft({
      name: 'X',
      description: '',
      changeNote: '',
      days: [
        {
          ...emptyDay(0),
          exercises: [
            {
              clientKey: 'ex1',
              exerciseId: '00000000-0000-4000-8000-000000000001',
              exerciseName: 'Press',
              instructions: '',
              videoMediaId: null,
              position: 0,
              notes: '',
              restSeconds: null,
              sets: [
                {
                  clientKey: 's1',
                  position: 0,
                  targetRepsMin: 12,
                  targetRepsMax: 8,
                  targetWeightKg: null,
                  restSeconds: null,
                },
              ],
            },
          ],
        },
      ],
    });
    expect(badReps).toMatch(/repeticiones/i);
  });

  it('reorders and duplicates days in local draft', () => {
    const d0 = { ...emptyDay(0), clientKey: 'a', name: 'A' };
    const d1 = { ...emptyDay(1), clientKey: 'b', name: 'B' };
    const moved = moveDayInWeek([d0, d1], 'b', -1);
    expect(moved.find((d) => d.clientKey === 'b')?.position).toBe(0);

    const duped = duplicateDayInDraft([d0, d1], 'a');
    expect(duped.filter((d) => d.weekIndex === 1).length).toBe(3);
    expect(duped.some((d) => d.name.includes('copia'))).toBe(true);
  });

  it('never autoplays routine exercise videos', () => {
    expect(ROUTINE_VIDEO_SHOULD_AUTOPLAY).toBe(false);
    expect(EXERCISE_VIDEO_SHOULD_AUTOPLAY).toBe(false);
  });
});
