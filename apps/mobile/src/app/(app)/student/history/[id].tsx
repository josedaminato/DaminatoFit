import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Link, useLocalSearchParams } from 'expo-router';
import { useBrand } from '@/brand/BrandProvider';
import {
  sessionStatusLabel,
  type WorkoutSession,
  type WorkoutSetLog,
} from '@/features/workouts/types';
import { getWorkoutSession } from '@/features/workouts/workout-api';
import { useSession } from '@/lib/session';
import { Button } from '@/ui/Button';
import { ErrorText } from '@/ui/ErrorText';
import { Screen } from '@/ui/Screen';

function prescribedLabel(s: WorkoutSetLog): string {
  const min = s.prescribedRepsMin;
  const max = s.prescribedRepsMax;
  const reps = min !== null && max !== null ? (min === max ? `${min}` : `${min}–${max}`) : '—';
  const w = s.prescribedWeightKg !== null ? `${s.prescribedWeightKg} kg` : '—';
  return `${reps} rep · ${w}`;
}

function actualLabel(s: WorkoutSetLog): string {
  const reps = s.actualReps !== null ? `${s.actualReps} rep` : '—';
  const w = s.actualWeightKg !== null ? `${s.actualWeightKg} kg` : '—';
  return `${reps} · ${w}${s.completed ? ' ✓' : ''}`;
}

export default function StudentHistoryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sessionId = typeof id === 'string' ? id : '';
  const { colors } = useBrand();
  const { apiContext } = useSession();
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [sets, setSets] = useState<WorkoutSetLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await getWorkoutSession(apiContext, sessionId);
        if (cancelled) return;
        setSession(res.session);
        setSets(res.sets);
        setError(null);
      } catch {
        if (!cancelled) setError('No se pudo cargar la sesión.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiContext, sessionId]);

  return (
    <Screen title="Detalle de sesión">
      {loading ? (
        <Text style={{ color: colors.textMuted }}>Cargando…</Text>
      ) : error ? (
        <ErrorText message={error} />
      ) : session ? (
        <View style={styles.stack}>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 18 }}>
            {session.planName ?? 'Rutina'} · {session.dayName ?? 'Día'}
          </Text>
          <Text style={{ color: colors.textMuted }}>
            {new Date(session.startedAt).toLocaleString()} · {sessionStatusLabel(session.status)}
          </Text>
          {sets.map((s) => (
            <View key={s.id} style={[styles.row, { borderColor: colors.border }]}>
              <Text style={{ color: colors.text, fontWeight: '600' }}>
                {s.exerciseName ?? 'Ejercicio'} · serie {s.position + 1}
              </Text>
              <Text style={{ color: colors.textMuted }}>Prescrito: {prescribedLabel(s)}</Text>
              <Text style={{ color: colors.text }}>Real: {actualLabel(s)}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <Link href="/student/history" asChild>
        <Button label="Volver al historial" variant="secondary" onPress={() => undefined} />
      </Link>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  row: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 4 },
});
