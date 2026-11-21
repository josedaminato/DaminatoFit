export function setVolumeKg(reps: number | null, weightKg: number | null): number {
  if (reps === null || weightKg === null) return 0;
  if (reps < 0 || weightKg < 0) return 0;
  return reps * weightKg;
}

export interface WeightHistoryPoint {
  exerciseId: string;
  loggedAt: string;
  weightKg: number | null;
  reps: number | null;
  sessionId: string;
}

export interface SparkPoint {
  x: number;
  y: number;
  weightKg: number;
  loggedAt: string;
}

/** Normalized sparkline points in 0..1 for a single exercise series. */
export function sparklinePointsForExercise(
  history: WeightHistoryPoint[],
  exerciseId: string,
  maxPoints = 24,
): SparkPoint[] {
  const series = history
    .filter((h) => h.exerciseId === exerciseId && h.weightKg !== null)
    .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));
  const slice = series.slice(-maxPoints);
  if (slice.length === 0) return [];
  const weights = slice.map((p) => p.weightKg as number);
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const span = max - min || 1;
  return slice.map((p, index) => ({
    x: slice.length <= 1 ? 0.5 : index / (slice.length - 1),
    y: 1 - ((p.weightKg as number) - min) / span,
    weightKg: p.weightKg as number,
    loggedAt: p.loggedAt,
  }));
}

export function maxWeightInHistory(
  history: WeightHistoryPoint[],
  exerciseId: string,
): number | null {
  const weights = history
    .filter((h) => h.exerciseId === exerciseId && h.weightKg !== null)
    .map((h) => h.weightKg as number);
  if (weights.length === 0) return null;
  return Math.max(...weights);
}
