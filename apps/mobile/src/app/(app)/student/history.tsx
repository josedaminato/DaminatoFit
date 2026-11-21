import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { useBrand } from '@/brand/BrandProvider';
import { sessionStatusLabel, type WorkoutSession } from '@/features/workouts/types';
import { listWorkoutSessions } from '@/features/workouts/workout-api';
import { useSession } from '@/lib/session';
import { Button } from '@/ui/Button';
import { ErrorText } from '@/ui/ErrorText';
import { Screen } from '@/ui/Screen';

export default function StudentHistoryScreen() {
  const { colors } = useBrand();
  const { apiContext } = useSession();
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await listWorkoutSessions(apiContext, { limit: 50 });
        if (cancelled) return;
        setSessions(res.sessions);
        setError(null);
      } catch {
        if (!cancelled) setError('No se pudo cargar el historial.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiContext]);

  return (
    <Screen title="Historial">
      {loading ? (
        <Text style={{ color: colors.textMuted }}>Cargando…</Text>
      ) : error ? (
        <ErrorText message={error} />
      ) : sessions.length === 0 ? (
        <Text style={{ color: colors.textMuted }}>Todavía no registraste entrenamientos.</Text>
      ) : (
        <View style={styles.list}>
          {sessions.map((s) => (
            <View key={s.id} style={[styles.row, { borderColor: colors.border }]}>
              <View style={styles.meta}>
                <Text style={{ color: colors.text, fontWeight: '700' }}>
                  {s.planName ?? 'Rutina'} · {s.dayName ?? 'Día'}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                  {new Date(s.startedAt).toLocaleString()} · {sessionStatusLabel(s.status)}
                </Text>
              </View>
              <Link href={`/student/history/${s.id}`} asChild>
                <Button label="Ver" variant="secondary" onPress={() => undefined} />
              </Link>
            </View>
          ))}
        </View>
      )}
      <Link href="/student" asChild>
        <Button label="Volver" variant="secondary" onPress={() => undefined} />
      </Link>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
    gap: 12,
  },
  meta: { flex: 1, gap: 4 },
});
