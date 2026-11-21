import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Link, useLocalSearchParams } from 'expo-router';
import { useBrand } from '@/brand/BrandProvider';
import {
  sessionStatusLabel,
  type StudentProgressPayload,
  type WorkoutSession,
} from '@/features/workouts/types';
import {
  getTrainerStudentProgress,
  listTrainerStudentWorkouts,
} from '@/features/workouts/workout-api';
import { useSession } from '@/lib/session';
import { Button } from '@/ui/Button';
import { ErrorText } from '@/ui/ErrorText';
import { Screen } from '@/ui/Screen';

export default function TrainerStudentWorkoutsScreen() {
  const { membershipId } = useLocalSearchParams<{ membershipId: string }>();
  const mid = typeof membershipId === 'string' ? membershipId : '';
  const { colors } = useBrand();
  const { apiContext } = useSession();
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [progress, setProgress] = useState<StudentProgressPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mid) return;
    let cancelled = false;
    void (async () => {
      try {
        const [workoutsRes, progressRes] = await Promise.all([
          listTrainerStudentWorkouts(apiContext, mid),
          getTrainerStudentProgress(apiContext, mid),
        ]);
        if (cancelled) return;
        setSessions(workoutsRes.sessions);
        setProgress(progressRes.progress);
        setError(null);
      } catch {
        if (!cancelled) setError('No se pudo cargar los entrenamientos del alumno.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiContext, mid]);

  return (
    <Screen title="Entrenamientos del alumno">
      {loading ? (
        <Text style={{ color: colors.textMuted }}>Cargando…</Text>
      ) : error ? (
        <ErrorText message={error} />
      ) : (
        <View style={styles.stack}>
          {progress ? (
            <View style={[styles.summary, { borderColor: colors.border }]}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>Resumen de progreso</Text>
              <Text style={{ color: colors.textMuted }}>
                Completadas: {progress.summary.completedSessions} · Volumen:{' '}
                {progress.summary.totalVolumeKg.toFixed(0)} kg·rep
              </Text>
            </View>
          ) : null}

          {sessions.length === 0 ? (
            <Text style={{ color: colors.textMuted }}>Sin sesiones registradas.</Text>
          ) : (
            sessions.map((s) => (
              <View key={s.id} style={[styles.row, { borderColor: colors.border }]}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ color: colors.text, fontWeight: '600' }}>
                    {s.planName ?? 'Rutina'} · {s.dayName ?? 'Día'}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                    {new Date(s.startedAt).toLocaleString()} · {sessionStatusLabel(s.status)}
                  </Text>
                </View>
                <Link href={`/student/history/${s.id}`} asChild>
                  <Button label="Detalle" variant="secondary" onPress={() => undefined} />
                </Link>
              </View>
            ))
          )}
        </View>
      )}
      <Link href="/trainer/students" asChild>
        <Button label="Volver a alumnos" variant="secondary" onPress={() => undefined} />
      </Link>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  summary: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, padding: 12, gap: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
  },
});
