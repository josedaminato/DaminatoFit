import { maxWeightInHistory, setVolumeKg } from './progress-math';

describe('progress-math', () => {
  it('returns max weight per exercise', () => {
    expect(
      maxWeightInHistory(
        [
          { exerciseId: 'a', loggedAt: '1', weightKg: 30, reps: 10, sessionId: 's' },
          { exerciseId: 'a', loggedAt: '2', weightKg: 45, reps: 6, sessionId: 's' },
        ],
        'a',
      ),
    ).toBe(45);
  });

  it('treats null volume as zero', () => {
    expect(setVolumeKg(null, 50)).toBe(0);
  });
});
