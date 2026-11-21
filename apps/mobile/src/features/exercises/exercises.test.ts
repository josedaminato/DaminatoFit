import { buildExercisesListPath, normalizeVideoContentType } from './exercise-api';
import { EXERCISE_VIDEO_SHOULD_AUTOPLAY, scopeBadgeLabel, validateExerciseWrite } from './types';

describe('exercise library UI helpers', () => {
  it('labels global vs personal exercises', () => {
    expect(scopeBadgeLabel('global')).toBe('Global');
    expect(scopeBadgeLabel('tenant')).toBe('Propio');
  });

  it('builds list query for search and muscle filter', () => {
    expect(buildExercisesListPath()).toBe('/v1/exercises');
    expect(buildExercisesListPath({ scope: 'global' })).toBe('/v1/exercises?scope=global');
    expect(buildExercisesListPath({ scope: 'mine', q: '  sentadilla  ' })).toBe(
      '/v1/exercises?scope=mine&q=sentadilla',
    );
    expect(buildExercisesListPath({ scope: 'mine', muscle: 'chest' })).toContain('muscle=chest');
  });

  it('validates create/edit fields', () => {
    expect(validateExerciseWrite({ name: '', description: '', instructions: '' })).toMatch(
      /nombre/i,
    );
    expect(
      validateExerciseWrite({
        name: 'Flexión',
        description: 'x'.repeat(4001),
        instructions: '',
      }),
    ).toMatch(/descripción/i);
    expect(
      validateExerciseWrite({
        name: 'Flexión',
        description: 'ok',
        instructions: 'Manos al ancho de hombros.',
      }),
    ).toBeNull();
  });

  it('accepts only allowed video MIME types for selection', () => {
    expect(normalizeVideoContentType('video/mp4')).toBe('video/mp4');
    expect(normalizeVideoContentType('video/quicktime')).toBe('video/quicktime');
    expect(normalizeVideoContentType('application/x-msdownload')).toBeNull();
    expect(normalizeVideoContentType('video/webm')).toBeNull();
  });

  it('never autoplays exercise videos', () => {
    expect(EXERCISE_VIDEO_SHOULD_AUTOPLAY).toBe(false);
  });
});
