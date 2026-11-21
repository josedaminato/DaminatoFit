import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { useBrand } from '@/brand/BrandProvider';
import { sparklinePointsForExercise } from '@/features/workouts/progress-math';
import type { StudentProgressPayload } from '@/features/workouts/types';
import { getStudentProgress } from '@/features/workouts/workout-api';
import { useSession } from '@/lib/session';
import { Button } from '@/ui/Button';
import { ErrorText } from '@/ui/ErrorText';
import { Screen } from '@/ui/Screen';

function MiniSparkline({
  points,
  color,
  trackColor,
}: {
  points: ReturnType<typeof sparklinePointsForExercise>;
  color: string;
  trackColor: string;
}) {
  if (points.length === 0) {
    return <View style={[styles.sparkTrack, { backgroundColor: trackColor }]} />;
  }
  return (
    <View style={[styles.sparkTrack, { backgroundColor: trackColor }]}>
      {points.map((p, i) => (
        <View
          key={`${p.loggedAt}-${i}`}
          style={[
            styles.sparkDot,
            {
              backgroundColor: color,
              left: `${p.x * 100}%`,
              top: `${p.y * 100}%`,
            },
          ]}
        />
      ))}
    </View>
  );
}

function VolumeBar({ value, max, color }: { value: number; max: number; color: string }) {
  const width = max > 0 ? `${Math.min(100, (value / max) * 100)}%` : '0%';
  return (
    <View style={styles.barTrack}>
      <View style={[styles.barFill, { width, backgroundColor: color }]} />
    </View>
  );
}

export default function StudentProgressScreen() {
  const { colors } = useBrand();
  const { apiContext } = useSession();
  const [progress, setProgress] = useState<StudentProgressPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await getStudentProgress(apiContext);
        if (cancelled) return;
        setProgress(res.progress);
        setError(null);
      } catch {
        if (!cancelled) setError('No se pudo cargar tu progreso.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiContext]);

  const maxExerciseVolume =
    progress?.exercises.reduce((m, e) => Math.max(m, e.totalVolumeKg), 0) ?? 0;

  return (
    <Screen title="Progreso">
      {loading ? (
        <Text style={{ color: colors.textMuted }}>Cargando…</Text>
      ) : error ? (
        <ErrorText message={error} />
      ) : progress ? (
        <View style={styles.stack}>
          <View style={[styles.summary, { borderColor: colors.border }]}>
            <Text style={{ color: colors.text, fontWeight: '700' }}>Resumen</Text>
            <Text style={{ color: colors.textMuted }}>
              Sesiones completadas: {progress.summary.completedSessions}
            </Text>
            <Text style={{ color: colors.textMuted }}>
              Series hechas: {progress.summary.totalSetsCompleted}
            </Text>
            <Text style={{ color: colors.textMuted }}>
              Volumen total: {progress.summary.totalVolumeKg.toFixed(0)} kg·rep
            </Text>
          </View>

          <Text style={[styles.heading, { color: colors.text }]}>Por ejercicio</Text>
          {progress.exercises.map((ex) => (
            <View key={ex.exerciseId} style={[styles.card, { borderColor: colors.border }]}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>
                {ex.exerciseName ?? 'Ejercicio'}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                Máx. peso: {ex.maxWeightKg ?? '—'} kg · Vol: {ex.totalVolumeKg.toFixed(0)}
              </Text>
              <VolumeBar value={ex.totalVolumeKg} max={maxExerciseVolume} color={colors.primary} />
              <MiniSparkline
                points={sparklinePointsForExercise(progress.weightHistory, ex.exerciseId)}
                color={colors.primary}
                trackColor={colors.surface}
              />
            </View>
          ))}
        </View>
      ) : null}
      <Link href="/student" asChild>
        <Button label="Volver" variant="secondary" onPress={() => undefined} />
      </Link>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  summary: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, padding: 12, gap: 6 },
  heading: { fontSize: 18, fontWeight: '700' },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, padding: 12, gap: 8 },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: '#e5e5e5', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  sparkTrack: { height: 48, borderRadius: 6, position: 'relative', overflow: 'hidden' },
  sparkDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: -4,
    marginTop: -4,
  },
});
