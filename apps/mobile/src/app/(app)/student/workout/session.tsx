import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useBrand } from '@/brand/BrandProvider';
import { ExerciseVideo } from '@/features/exercises/ExerciseVideo';
import {
  setsSummary,
  type RoutineDay,
  type RoutineExercise,
  type StudentRoutineDetail,
} from '@/features/routines/types';
import {
  getActiveLocalSession,
  getLocalSessionByClientId,
  listSetLogsForSession,
  upsertLocalSession,
  upsertLocalSetLog,
  type LocalSetRow,
} from '@/features/workouts/local-db';
import { loadStudentRoutineWithCache } from '@/features/workouts/routine-cache';
import { useRestTimer } from '@/features/workouts/rest-timer';
import {
  completeLocalSet,
  finishLocalSession,
  seedSetLogsFromDay,
  startLocalSession,
} from '@/features/workouts/session-local';
import { parseSetNumberField, validateSetInputs } from '@/features/workouts/set-validation';
import { pendingCount, syncNow } from '@/features/workouts/sync';
import { finishWorkoutSession, getActiveWorkoutSession } from '@/features/workouts/workout-api';
import { newWorkoutClientId } from '@/features/workouts/types';
import { useSession } from '@/lib/session';
import { Button } from '@/ui/Button';
import { ErrorText } from '@/ui/ErrorText';
import { Field } from '@/ui/Field';
import { Screen } from '@/ui/Screen';

function findDay(routine: StudentRoutineDetail, dayId: string): RoutineDay | null {
  return routine.days.find((d) => d.id === dayId) ?? null;
}

function flatExercises(day: RoutineDay): RoutineExercise[] {
  return [...day.exercises].sort((a, b) => a.position - b.position);
}

export default function WorkoutSessionScreen() {
  const { planId, dayId } = useLocalSearchParams<{ planId: string; dayId: string }>();
  const plan = typeof planId === 'string' ? planId : '';
  const dayKey = typeof dayId === 'string' ? dayId : '';
  const { colors } = useBrand();
  const router = useRouter();
  const { apiContext, activeMembership } = useSession();
  const rest = useRestTimer();

  const [routine, setRoutine] = useState<StudentRoutineDetail | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [sessionClientId, setSessionClientId] = useState<string | null>(null);
  const [sets, setSets] = useState<LocalSetRow[]>([]);
  const [exerciseIndex, setExerciseIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [showVideo, setShowVideo] = useState(false);

  const [repsText, setRepsText] = useState('');
  const [weightText, setWeightText] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);

  const membershipId = activeMembership?.id ?? '';
  const tenantId = activeMembership?.tenantId ?? '';

  const day = useMemo(
    () => (routine && dayKey ? findDay(routine, dayKey) : null),
    [routine, dayKey],
  );
  const exercises = useMemo(() => (day ? flatExercises(day) : []), [day]);
  const currentExercise = exercises[exerciseIndex] ?? null;

  const completedCount = sets.filter((s) => s.completed === 1).length;

  const refreshPending = useCallback(async () => {
    if (!membershipId || !tenantId) return;
    const n = await pendingCount(membershipId, tenantId);
    setPending(n);
  }, [membershipId, tenantId]);

  const runSync = useCallback(async () => {
    if (!membershipId || !tenantId) return;
    await syncNow(apiContext, membershipId, tenantId);
    await refreshPending();
  }, [apiContext, membershipId, tenantId, refreshPending]);

  const applySetFields = useCallback((row: LocalSetRow | null) => {
    if (!row) {
      setRepsText('');
      setWeightText('');
      return;
    }
    setRepsText(row.actual_reps !== null ? String(row.actual_reps) : '');
    setWeightText(
      row.actual_weight_kg !== null
        ? String(row.actual_weight_kg)
        : String(row.prescribed_weight_kg ?? ''),
    );
    setFieldError(null);
  }, []);

  useEffect(() => {
    if (!plan || !dayKey || !membershipId || !tenantId) return;
    let cancelled = false;
    void (async () => {
      try {
        const { routine: loaded, fromCache: cached } = await loadStudentRoutineWithCache(
          apiContext,
          plan,
        );
        if (cancelled) return;
        setRoutine(loaded);
        setFromCache(cached);

        const dayMatch = findDay(loaded, dayKey);
        if (!dayMatch) {
          setError('Día de rutina no encontrado.');
          setLoading(false);
          return;
        }

        let clientId: string | null = null;
        const localActive = await getActiveLocalSession(membershipId, tenantId);
        if (localActive?.day_id === dayKey && localActive.status === 'in_progress') {
          clientId = localActive.client_id;
        } else {
          try {
            const remote = await getActiveWorkoutSession(apiContext);
            if (remote.active?.session.routineVersionDayId === dayKey) {
              clientId = remote.active.session.clientId;
              await upsertLocalSession({
                clientId,
                serverId: remote.active.session.id,
                membershipId,
                tenantId,
                routineVersionId: loaded.version.id,
                dayId: dayKey,
                status: 'in_progress',
                startedAt: remote.active.session.startedAt,
                notes: remote.active.session.notes,
                dirty: 0,
              });
              for (const s of remote.active.sets) {
                await upsertLocalSetLog({
                  clientId: s.clientId,
                  sessionClientId: clientId!,
                  serverId: s.id,
                  exerciseId: s.exerciseId,
                  routineVersionSetId: s.routineVersionSetId,
                  position: s.position,
                  prescribedRepsMin: s.prescribedRepsMin,
                  prescribedRepsMax: s.prescribedRepsMax,
                  prescribedWeightKg: s.prescribedWeightKg,
                  actualReps: s.actualReps,
                  actualWeightKg: s.actualWeightKg,
                  completed: s.completed,
                  notes: s.notes,
                  loggedAt: s.loggedAt,
                  clientUpdatedAt: s.clientUpdatedAt,
                  dirty: 0,
                });
              }
            }
          } catch {
            // offline: solo local
          }
        }

        if (!clientId) {
          clientId = newWorkoutClientId();
          await startLocalSession({
            clientId,
            membershipId,
            tenantId,
            routineVersionId: loaded.version.id,
            dayId: dayKey,
          });
          await seedSetLogsFromDay(clientId, dayMatch);
        }

        const rows = await listSetLogsForSession(clientId);
        if (cancelled) return;
        setSessionClientId(clientId);
        setSets(rows);
        const firstPending = rows.findIndex((r) => r.completed === 0);
        const exForSet = rows[firstPending >= 0 ? firstPending : 0];
        let nextExIdx = 0;
        if (exForSet && dayMatch) {
          const dayExercises = flatExercises(dayMatch);
          const exIdx = dayExercises.findIndex((e) => e.exerciseId === exForSet.exercise_id);
          if (exIdx >= 0) nextExIdx = exIdx;
        }
        setExerciseIndex(nextExIdx);
        const activeRow =
          rows.find((r) => r.exercise_id === exForSet?.exercise_id && r.completed === 0) ??
          exForSet ??
          null;
        applySetFields(activeRow);
        setError(null);
        await runSync();
      } catch {
        if (!cancelled) setError('No se pudo iniciar el entrenamiento.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiContext, applySetFields, dayKey, membershipId, plan, runSync, tenantId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (!cancelled) await refreshPending();
    })();
    const id = setInterval(() => {
      void refreshPending();
    }, 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [refreshPending]);

  const currentSet = useMemo(() => {
    if (!currentExercise) return null;
    return (
      sets.find((s) => s.exercise_id === currentExercise.exerciseId && s.completed === 0) ??
      sets.find((s) => s.exercise_id === currentExercise.exerciseId) ??
      null
    );
  }, [currentExercise, sets]);

  const onCompleteSet = async () => {
    if (!sessionClientId || !currentSet || !currentExercise) return;
    const actualReps = parseSetNumberField(repsText);
    const actualWeightKg = parseSetNumberField(weightText);
    const validation = validateSetInputs({ actualReps, actualWeightKg });
    if (validation) {
      setFieldError(validation);
      return;
    }
    await completeLocalSet({
      clientId: currentSet.client_id,
      sessionClientId,
      exerciseId: currentExercise.exerciseId,
      routineVersionSetId: currentSet.routine_version_set_id,
      position: currentSet.position,
      prescribedRepsMin: currentSet.prescribed_reps_min,
      prescribedRepsMax: currentSet.prescribed_reps_max,
      prescribedWeightKg: currentSet.prescribed_weight_kg,
      actualReps,
      actualWeightKg,
      serverId: currentSet.server_id,
    });
    const rows = await listSetLogsForSession(sessionClientId);
    setSets(rows);
    const restSec =
      currentExercise.sets.find((s) => s.id === currentSet.routine_version_set_id)?.restSeconds ??
      currentExercise.restSeconds ??
      90;
    if (restSec) rest.start(restSec);
    await runSync();
    const stillPending = rows.some(
      (r) => r.exercise_id === currentExercise.exerciseId && r.completed === 0,
    );
    if (!stillPending && exerciseIndex < exercises.length - 1) {
      const nextIdx = exerciseIndex + 1;
      setExerciseIndex(nextIdx);
      const nextEx = exercises[nextIdx];
      const nextRow = nextEx
        ? (rows.find((r) => r.exercise_id === nextEx.exerciseId && r.completed === 0) ??
          rows.find((r) => r.exercise_id === nextEx.exerciseId) ??
          null)
        : null;
      applySetFields(nextRow);
    } else {
      const nextRow =
        rows.find((r) => r.exercise_id === currentExercise.exerciseId && r.completed === 0) ??
        rows.find((r) => r.exercise_id === currentExercise.exerciseId) ??
        null;
      applySetFields(nextRow);
    }
  };

  const onFinish = async (status: 'completed' | 'abandoned') => {
    if (!sessionClientId) return;
    setFinishing(true);
    try {
      await finishLocalSession(sessionClientId, status);
      const session = await getLocalSessionByClientId(sessionClientId);
      if (session?.server_id) {
        try {
          await finishWorkoutSession(apiContext, session.server_id, { status });
        } catch {
          // sync cubre offline
        }
      }
      await runSync();
      router.replace('/student');
    } finally {
      setFinishing(false);
    }
  };

  if (!plan || !dayKey) {
    return (
      <Screen title="Entrenamiento">
        <Text style={{ color: colors.textMuted }}>Sesión inválida.</Text>
      </Screen>
    );
  }

  return (
    <Screen title={day?.name ?? 'Entrenamiento'}>
      {loading ? (
        <Text style={{ color: colors.textMuted }}>Preparando sesión…</Text>
      ) : error ? (
        <ErrorText message={error} />
      ) : routine && day && sessionClientId ? (
        <View style={styles.stack}>
          {fromCache ? (
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              Rutina desde caché (sin conexión).
            </Text>
          ) : null}
          {pending > 0 ? (
            <Pressable onPress={() => void runSync()}>
              <Text style={{ color: colors.primary }}>
                Pendiente de sincronizar ({pending}) · Tocá para enviar
              </Text>
            </Pressable>
          ) : null}

          <Text style={{ color: colors.textMuted }}>
            Progreso: {completedCount} / {sets.length} series
          </Text>

          {rest.isRunning ? (
            <View
              style={[
                styles.restBox,
                { borderColor: colors.primary, backgroundColor: colors.surface },
              ]}
            >
              <Text style={[styles.restTitle, { color: colors.text }]}>
                Descanso {rest.format()}
              </Text>
              <View style={styles.restActions}>
                {rest.isPaused ? (
                  <Button label="Continuar" onPress={rest.resume} />
                ) : (
                  <Button label="Pausar" variant="secondary" onPress={rest.pause} />
                )}
                <Button label="Saltar" variant="secondary" onPress={rest.skip} />
              </View>
            </View>
          ) : null}

          <View style={styles.exerciseTabs}>
            {exercises.map((ex, idx) => (
              <Pressable
                key={ex.id}
                onPress={() => {
                  setExerciseIndex(idx);
                  const row =
                    sets.find((s) => s.exercise_id === ex.exerciseId && s.completed === 0) ??
                    sets.find((s) => s.exercise_id === ex.exerciseId) ??
                    null;
                  applySetFields(row);
                }}
                style={[
                  styles.tab,
                  {
                    borderColor: idx === exerciseIndex ? colors.primary : colors.border,
                    backgroundColor: idx === exerciseIndex ? colors.surface : 'transparent',
                  },
                ]}
              >
                <Text style={{ color: colors.text, fontSize: 12 }} numberOfLines={1}>
                  {ex.exerciseName}
                </Text>
              </Pressable>
            ))}
          </View>

          {currentExercise && currentSet ? (
            <View style={[styles.card, { borderColor: colors.border }]}>
              <Text style={[styles.exTitle, { color: colors.text }]}>
                {currentExercise.exerciseName}
              </Text>
              <Text style={{ color: colors.textMuted }}>
                Prescripción:{' '}
                {setsSummary({
                  targetRepsMin: currentSet.prescribed_reps_min ?? 0,
                  targetRepsMax: currentSet.prescribed_reps_max ?? 0,
                  targetWeightKg: currentSet.prescribed_weight_kg,
                })}
              </Text>

              <Field
                label="Repeticiones"
                keyboardType="number-pad"
                value={repsText}
                onChangeText={setRepsText}
                style={styles.bigInput}
              />
              <Field
                label="Peso (kg)"
                keyboardType="decimal-pad"
                value={weightText}
                onChangeText={setWeightText}
                style={styles.bigInput}
              />
              <ErrorText message={fieldError} />
              <Button label="Completar serie" onPress={() => void onCompleteSet()} />
            </View>
          ) : (
            <Text style={{ color: colors.textMuted }}>
              Todas las series de este ejercicio están hechas.
            </Text>
          )}

          <Pressable onPress={() => setShowVideo((v) => !v)}>
            <Text style={{ color: colors.primary }}>
              {showVideo ? 'Ocultar video' : 'Ver video (opcional)'}
            </Text>
          </Pressable>
          {showVideo && currentExercise ? (
            <ExerciseVideo mediaId={currentExercise.videoMediaId} apiContext={apiContext} />
          ) : null}

          <View style={styles.finishRow}>
            <Button
              label="Finalizar entrenamiento"
              onPress={() => void onFinish('completed')}
              loading={finishing}
            />
            <Button
              label="Abandonar"
              variant="danger"
              onPress={() => void onFinish('abandoned')}
              loading={finishing}
            />
          </View>
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
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 14, gap: 12 },
  exTitle: { fontSize: 22, fontWeight: '800' },
  bigInput: { fontSize: 22, paddingVertical: 16 },
  restBox: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 10 },
  restTitle: { fontSize: 28, fontWeight: '800', textAlign: 'center' },
  restActions: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  exerciseTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tab: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    maxWidth: '48%',
  },
  finishRow: { gap: 10, marginTop: 8 },
});
