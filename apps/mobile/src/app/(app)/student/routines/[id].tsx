import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Link, useLocalSearchParams, type Href } from 'expo-router';
import { useBrand } from '@/brand/BrandProvider';
import { ExerciseVideo } from '@/features/exercises/ExerciseVideo';
import { getStudentRoutine } from '@/features/routines/routine-api';
import {
  dayWeekPrefix,
  setsSummary,
  type RoutineDay,
  type StudentRoutineDetail,
} from '@/features/routines/types';
import { useSession } from '@/lib/session';
import { Screen } from '@/ui/Screen';
import { Button } from '@/ui/Button';
import { ErrorText } from '@/ui/ErrorText';

export default function StudentRoutineDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const routineId = typeof id === 'string' ? id : '';
  const { colors } = useBrand();
  const { apiContext } = useSession();

  const [routine, setRoutine] = useState<StudentRoutineDetail | null>(null);
  const [loading, setLoading] = useState(Boolean(routineId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!routineId) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await getStudentRoutine(apiContext, routineId);
        if (cancelled) return;
        setRoutine(data);
        setError(null);
      } catch {
        if (cancelled) return;
        setError('No se pudo cargar tu rutina.');
        setRoutine(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiContext, routineId]);

  const sortedDays = useMemo(() => {
    if (!routine) return [] as RoutineDay[];
    return [...routine.days].sort((a, b) => a.weekIndex - b.weekIndex || a.position - b.position);
  }, [routine]);

  if (!routineId) {
    return (
      <Screen title="Mi rutina">
        <Text style={{ color: colors.textMuted }}>Rutina no encontrada.</Text>
      </Screen>
    );
  }

  return (
    <Screen title={routine?.name ?? 'Mi rutina'}>
      {loading ? (
        <Text style={{ color: colors.textMuted }}>Cargando…</Text>
      ) : error ? (
        <ErrorText message={error} />
      ) : routine ? (
        <View style={styles.stack}>
          {routine.description ? (
            <Text style={{ color: colors.textMuted }}>{routine.description}</Text>
          ) : null}
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>
            Versión {routine.version.versionNumber}
            {routine.version.startsOn ? ` · desde ${routine.version.startsOn}` : ''}
            {routine.version.endsOn ? ` · hasta ${routine.version.endsOn}` : ''}
          </Text>

          {sortedDays.map((day) => (
            <View key={day.id} style={[styles.dayBlock, { borderColor: colors.border }]}>
              <Text style={[styles.dayTitle, { color: colors.text }]}>
                {dayWeekPrefix(day.weekIndex, sortedDays)}
                {day.name}
              </Text>
              {day.notes ? (
                <Text style={{ color: colors.textMuted, fontSize: 14 }}>{day.notes}</Text>
              ) : null}

              <Link
                href={
                  {
                    pathname: '/student/workout/session',
                    params: { planId: routineId, dayId: day.id },
                  } as Href
                }
                asChild
              >
                <Button label="Entrenar" onPress={() => undefined} />
              </Link>

              {[...day.exercises]
                .sort((a, b) => a.position - b.position)
                .map((ex) => (
                  <View key={ex.id} style={[styles.exercise, { borderColor: colors.border }]}>
                    <Text style={{ color: colors.text, fontWeight: '700' }}>{ex.exerciseName}</Text>
                    {ex.instructions ? (
                      <Text style={{ color: colors.textMuted, fontSize: 14 }}>
                        {ex.instructions}
                      </Text>
                    ) : null}
                    {ex.notes ? (
                      <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                        Notas: {ex.notes}
                      </Text>
                    ) : null}
                    <View style={styles.sets}>
                      {[...ex.sets]
                        .sort((a, b) => a.position - b.position)
                        .map((set, index) => (
                          <Text key={set.id} style={{ color: colors.text }}>
                            Serie {index + 1}: {setsSummary(set)}
                            {set.restSeconds !== null ? ` · descanso ${set.restSeconds}s` : ''}
                          </Text>
                        ))}
                    </View>
                    {ex.restSeconds !== null ? (
                      <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                        Descanso entre ejercicios: {ex.restSeconds}s
                      </Text>
                    ) : null}
                    <ExerciseVideo mediaId={ex.videoMediaId} apiContext={apiContext} />
                  </View>
                ))}
            </View>
          ))}
        </View>
      ) : null}

      <Link href="/student" asChild>
        <Button label="Volver al inicio" variant="secondary" onPress={() => undefined} />
      </Link>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 16 },
  dayBlock: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 12,
    gap: 10,
  },
  dayTitle: { fontSize: 18, fontWeight: '700' },
  exercise: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    gap: 8,
  },
  sets: { gap: 4 },
});
