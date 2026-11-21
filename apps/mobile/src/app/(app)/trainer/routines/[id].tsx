import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useBrand } from '@/brand/BrandProvider';
import { listExercises } from '@/features/exercises/exercise-api';
import type { Exercise } from '@/features/exercises/types';
import {
  archiveRoutine,
  duplicateRoutine,
  ensureNewRoutineDraft,
  getRoutine,
  publishRoutine,
  saveRoutineDraft,
} from '@/features/routines/routine-api';
import {
  dayWeekPrefix,
  draftToWriteBody,
  duplicateDayInDraft,
  emptyDay,
  emptyExerciseDraft,
  emptySet,
  moveDayInWeek,
  normalizeAllDayPositions,
  parseIntField,
  parseOptionalNumber,
  routineDaysToDraft,
  routineKindLabel,
  routineStatusLabel,
  validateDraft,
  type DraftDayInput,
  type DraftExerciseInput,
  type RoutineDetail,
  type RoutineDraftFormState,
} from '@/features/routines/types';
import { useSession } from '@/lib/session';
import { Screen } from '@/ui/Screen';
import { Field } from '@/ui/Field';
import { Button } from '@/ui/Button';
import { ErrorText } from '@/ui/ErrorText';

export default function TrainerRoutineEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const routineId = typeof id === 'string' ? id : '';
  const { colors } = useBrand();
  const { apiContext } = useSession();
  const router = useRouter();

  const [meta, setMeta] = useState<RoutineDetail | null>(null);
  const [form, setForm] = useState<RoutineDraftFormState>({
    name: '',
    description: '',
    changeNote: '',
    days: [emptyDay(0)],
  });
  const [loading, setLoading] = useState(Boolean(routineId));
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerDayKey, setPickerDayKey] = useState<string | null>(null);
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerExercises, setPickerExercises] = useState<Exercise[]>([]);

  const requestReload = useCallback(() => {
    setLoading(true);
    setReloadToken((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!routineId) return;
    let cancelled = false;
    void (async () => {
      try {
        const routine = await getRoutine(apiContext, routineId);
        if (cancelled) return;
        setMeta(routine);
        const days = routine.days.length > 0 ? routineDaysToDraft(routine.days) : [emptyDay(0)];
        setForm({
          name: routine.name,
          description: routine.description,
          changeNote: '',
          days: normalizeAllDayPositions(days),
        });
        setError(null);
      } catch {
        if (cancelled) return;
        setError('No se pudo cargar la rutina.');
        setMeta(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiContext, reloadToken, routineId]);

  useEffect(() => {
    if (!pickerOpen) return;
    let cancelled = false;
    void (async () => {
      try {
        const rows = await listExercises(apiContext, { scope: 'all', q: pickerSearch });
        if (!cancelled) setPickerExercises(rows);
      } catch {
        if (!cancelled) setPickerExercises([]);
      } finally {
        if (!cancelled) setPickerLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiContext, pickerOpen, pickerSearch]);

  const sortedDays = useMemo(() => normalizeAllDayPositions([...form.days]), [form.days]);

  const updateDay = (clientKey: string, patch: Partial<DraftDayInput>) => {
    setForm((prev) => ({
      ...prev,
      days: prev.days.map((d) => (d.clientKey === clientKey ? { ...d, ...patch } : d)),
    }));
  };

  const updateExercise = (
    dayKey: string,
    exerciseKey: string,
    patch: Partial<DraftExerciseInput>,
  ) => {
    setForm((prev) => ({
      ...prev,
      days: prev.days.map((day) =>
        day.clientKey !== dayKey
          ? day
          : {
              ...day,
              exercises: day.exercises.map((ex) =>
                ex.clientKey === exerciseKey ? { ...ex, ...patch } : ex,
              ),
            },
      ),
    }));
  };

  const onSave = async () => {
    if (!routineId) return;
    const validation = validateDraft(form);
    if (validation) {
      setError(validation);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveRoutineDraft(apiContext, routineId, draftToWriteBody(form));
      requestReload();
    } catch {
      setError('No se pudo guardar el borrador.');
    } finally {
      setSaving(false);
    }
  };

  const onPublish = async () => {
    if (!routineId) return;
    const validation = validateDraft(form);
    if (validation) {
      setError(validation);
      return;
    }
    setActionLoading(true);
    setError(null);
    try {
      await saveRoutineDraft(apiContext, routineId, draftToWriteBody(form));
      await publishRoutine(apiContext, routineId, {
        changeNote: form.changeNote.trim() || undefined,
      });
      requestReload();
    } catch {
      setError('No se pudo publicar. Guardá el borrador y verificá que tenga contenido.');
    } finally {
      setActionLoading(false);
    }
  };

  const onEnsureDraft = async () => {
    if (!routineId) return;
    setActionLoading(true);
    setError(null);
    try {
      await ensureNewRoutineDraft(apiContext, routineId);
      requestReload();
    } catch {
      setError('No se pudo abrir un borrador nuevo.');
    } finally {
      setActionLoading(false);
    }
  };

  const onDuplicateTemplate = async () => {
    if (!routineId) return;
    setActionLoading(true);
    setError(null);
    try {
      const copy = await duplicateRoutine(apiContext, routineId);
      router.replace(`/trainer/routines/${copy.id}`);
    } catch {
      setError('No se pudo duplicar la plantilla.');
    } finally {
      setActionLoading(false);
    }
  };

  const onArchive = async () => {
    if (!routineId) return;
    setActionLoading(true);
    setError(null);
    try {
      await archiveRoutine(apiContext, routineId);
      router.replace('/trainer/routines');
    } catch {
      setError('No se pudo archivar la rutina.');
    } finally {
      setActionLoading(false);
    }
  };

  const openPicker = (dayKey: string) => {
    setPickerDayKey(dayKey);
    setPickerQuery('');
    setPickerSearch('');
    setPickerLoading(true);
    setPickerOpen(true);
  };

  const applyPickerSearch = () => {
    setPickerSearch(pickerQuery.trim());
  };

  const addExerciseToDay = (exercise: Exercise) => {
    if (!pickerDayKey) return;
    setForm((prev) => ({
      ...prev,
      days: prev.days.map((day) => {
        if (day.clientKey !== pickerDayKey) return day;
        const position = day.exercises.length;
        return {
          ...day,
          exercises: [
            ...day.exercises,
            emptyExerciseDraft({
              exerciseId: exercise.id,
              exerciseName: exercise.revision.name,
              instructions: exercise.revision.instructions,
              videoMediaId: exercise.revision.videoMediaId,
              position,
            }),
          ],
        };
      }),
    }));
    setPickerOpen(false);
    setPickerDayKey(null);
  };

  const removeExercise = (dayKey: string, exerciseKey: string) => {
    setForm((prev) => ({
      ...prev,
      days: prev.days.map((day) =>
        day.clientKey === dayKey
          ? {
              ...day,
              exercises: day.exercises
                .filter((ex) => ex.clientKey !== exerciseKey)
                .map((ex, index) => ({ ...ex, position: index })),
            }
          : day,
      ),
    }));
  };

  const addSet = (dayKey: string, exerciseKey: string) => {
    setForm((prev) => ({
      ...prev,
      days: prev.days.map((day) => {
        if (day.clientKey !== dayKey) return day;
        return {
          ...day,
          exercises: day.exercises.map((ex) => {
            if (ex.clientKey !== exerciseKey) return ex;
            return {
              ...ex,
              sets: [...ex.sets, emptySet(ex.sets.length)],
            };
          }),
        };
      }),
    }));
  };

  if (!routineId) {
    return (
      <Screen title="Editor de rutina">
        <Text style={{ color: colors.textMuted }}>Rutina no encontrada.</Text>
      </Screen>
    );
  }

  return (
    <Screen title={form.name.trim() || 'Editor de rutina'}>
      {loading ? (
        <Text style={{ color: colors.textMuted }}>Cargando…</Text>
      ) : (
        <View style={styles.stack}>
          {meta ? (
            <Text style={{ color: colors.textMuted, fontSize: 14 }}>
              {routineKindLabel(meta.kind)} · {routineStatusLabel(meta.status)}
              {meta.draftVersionId ? ' · borrador abierto' : ''}
            </Text>
          ) : null}

          <Field
            label="Nombre"
            value={form.name}
            onChangeText={(name) => setForm((f) => ({ ...f, name }))}
          />
          <Field
            label="Descripción"
            multiline
            value={form.description}
            onChangeText={(description) => setForm((f) => ({ ...f, description }))}
            style={styles.multiline}
          />
          <Field
            label="Nota de cambio (publicación)"
            value={form.changeNote}
            onChangeText={(changeNote) => setForm((f) => ({ ...f, changeNote }))}
          />

          <View style={styles.actionsRow}>
            <Button label="Guardar borrador" onPress={() => void onSave()} loading={saving} />
            <Button
              label="Publicar"
              variant="secondary"
              onPress={() => void onPublish()}
              loading={actionLoading}
            />
          </View>

          <View style={styles.actionsRow}>
            {meta?.kind === 'template' ? (
              <Link href={`/trainer/routines/assign?id=${routineId}`} asChild>
                <Button label="Asignar" variant="secondary" onPress={() => undefined} />
              </Link>
            ) : null}
            <Button
              label="Nuevo borrador"
              variant="secondary"
              onPress={() => void onEnsureDraft()}
              loading={actionLoading}
            />
          </View>

          <View style={styles.actionsRow}>
            {meta?.kind === 'template' ? (
              <Button
                label="Duplicar plantilla"
                variant="secondary"
                onPress={() => void onDuplicateTemplate()}
                loading={actionLoading}
              />
            ) : null}
            <Button
              label="Archivar"
              variant="danger"
              onPress={() => void onArchive()}
              loading={actionLoading}
            />
          </View>

          <View style={styles.daysHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Días</Text>
            <Button
              label="Agregar día"
              variant="secondary"
              onPress={() =>
                setForm((prev) => ({
                  ...prev,
                  days: normalizeAllDayPositions([
                    ...prev.days,
                    emptyDay(prev.days.filter((d) => d.weekIndex === 1).length, 1),
                  ]),
                }))
              }
            />
          </View>

          {sortedDays.map((day) => (
            <View key={day.clientKey} style={[styles.dayCard, { borderColor: colors.border }]}>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}>
                {dayWeekPrefix(day.weekIndex, sortedDays)}
                {day.name}
              </Text>

              <Field
                label="Nombre del día"
                value={day.name}
                onChangeText={(name) => updateDay(day.clientKey, { name })}
              />
              <Field
                label="Semana"
                keyboardType="number-pad"
                value={String(day.weekIndex)}
                onChangeText={(text) =>
                  updateDay(day.clientKey, { weekIndex: parseIntField(text, day.weekIndex) })
                }
              />
              <Field
                label="Notas del día"
                multiline
                value={day.notes}
                onChangeText={(notes) => updateDay(day.clientKey, { notes })}
                style={styles.multiline}
              />

              <View style={styles.actionsRow}>
                <Button
                  label="Subir"
                  variant="secondary"
                  onPress={() =>
                    setForm((prev) => ({
                      ...prev,
                      days: moveDayInWeek(prev.days, day.clientKey, -1),
                    }))
                  }
                />
                <Button
                  label="Bajar"
                  variant="secondary"
                  onPress={() =>
                    setForm((prev) => ({
                      ...prev,
                      days: moveDayInWeek(prev.days, day.clientKey, 1),
                    }))
                  }
                />
                <Button
                  label="Duplicar día"
                  variant="secondary"
                  onPress={() =>
                    setForm((prev) => ({
                      ...prev,
                      days: duplicateDayInDraft(prev.days, day.clientKey),
                    }))
                  }
                />
              </View>

              <Button label="Agregar ejercicio" onPress={() => openPicker(day.clientKey)} />

              {day.exercises.map((ex) => (
                <View
                  key={ex.clientKey}
                  style={[styles.exerciseCard, { borderColor: colors.border }]}
                >
                  <Text style={{ color: colors.text, fontWeight: '700' }}>{ex.exerciseName}</Text>
                  <Field
                    label="Notas del ejercicio"
                    value={ex.notes}
                    onChangeText={(notes) => updateExercise(day.clientKey, ex.clientKey, { notes })}
                  />
                  <Field
                    label="Descanso entre series (s)"
                    keyboardType="number-pad"
                    value={ex.restSeconds === null ? '' : String(ex.restSeconds)}
                    onChangeText={(text) =>
                      updateExercise(day.clientKey, ex.clientKey, {
                        restSeconds: parseOptionalNumber(text),
                      })
                    }
                  />

                  {ex.sets.map((set, setIndex) => (
                    <View key={set.clientKey} style={styles.setRow}>
                      <Text style={{ color: colors.textMuted, fontWeight: '600' }}>
                        Serie {setIndex + 1}
                      </Text>
                      <Field
                        label="Reps mín."
                        keyboardType="number-pad"
                        value={String(set.targetRepsMin)}
                        onChangeText={(text) =>
                          updateExercise(day.clientKey, ex.clientKey, {
                            sets: ex.sets.map((s) =>
                              s.clientKey === set.clientKey
                                ? { ...s, targetRepsMin: parseIntField(text, s.targetRepsMin) }
                                : s,
                            ),
                          })
                        }
                      />
                      <Field
                        label="Reps máx."
                        keyboardType="number-pad"
                        value={String(set.targetRepsMax)}
                        onChangeText={(text) =>
                          updateExercise(day.clientKey, ex.clientKey, {
                            sets: ex.sets.map((s) =>
                              s.clientKey === set.clientKey
                                ? { ...s, targetRepsMax: parseIntField(text, s.targetRepsMax) }
                                : s,
                            ),
                          })
                        }
                      />
                      <Field
                        label="Peso (kg)"
                        keyboardType="decimal-pad"
                        value={set.targetWeightKg === null ? '' : String(set.targetWeightKg)}
                        onChangeText={(text) =>
                          updateExercise(day.clientKey, ex.clientKey, {
                            sets: ex.sets.map((s) =>
                              s.clientKey === set.clientKey
                                ? { ...s, targetWeightKg: parseOptionalNumber(text) }
                                : s,
                            ),
                          })
                        }
                      />
                      <Field
                        label="Descanso (s)"
                        keyboardType="number-pad"
                        value={set.restSeconds === null ? '' : String(set.restSeconds)}
                        onChangeText={(text) =>
                          updateExercise(day.clientKey, ex.clientKey, {
                            sets: ex.sets.map((s) =>
                              s.clientKey === set.clientKey
                                ? { ...s, restSeconds: parseOptionalNumber(text) }
                                : s,
                            ),
                          })
                        }
                      />
                    </View>
                  ))}

                  <View style={styles.actionsRow}>
                    <Button
                      label="Agregar serie"
                      variant="secondary"
                      onPress={() => addSet(day.clientKey, ex.clientKey)}
                    />
                    <Button
                      label="Quitar ejercicio"
                      variant="danger"
                      onPress={() => removeExercise(day.clientKey, ex.clientKey)}
                    />
                  </View>
                </View>
              ))}
            </View>
          ))}

          <ErrorText message={error} />
          <Link href="/trainer/routines" asChild>
            <Button label="Volver a la lista" variant="secondary" onPress={() => undefined} />
          </Link>
        </View>
      )}

      <Modal visible={pickerOpen} animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Elegir ejercicio</Text>
          <Field
            label="Buscar"
            value={pickerQuery}
            onChangeText={setPickerQuery}
            onSubmitEditing={applyPickerSearch}
            returnKeyType="search"
          />
          <Button label="Buscar" variant="secondary" onPress={applyPickerSearch} />
          {pickerLoading ? (
            <Text style={{ color: colors.textMuted }}>Cargando ejercicios…</Text>
          ) : (
            <FlatList
              data={pickerExercises}
              keyExtractor={(item) => item.id}
              style={styles.pickerList}
              ListEmptyComponent={<Text style={{ color: colors.textMuted }}>Sin resultados.</Text>}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => addExerciseToDay(item)}
                  style={[styles.pickerRow, { borderColor: colors.border }]}
                >
                  <Text style={{ color: colors.text, fontWeight: '600' }}>
                    {item.revision.name}
                  </Text>
                </Pressable>
              )}
            />
          )}
          <Button label="Cerrar" variant="secondary" onPress={() => setPickerOpen(false)} />
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  daysHeader: { gap: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  dayCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 12,
    gap: 10,
  },
  exerciseCard: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    gap: 8,
  },
  setRow: { gap: 6, paddingTop: 4 },
  modal: { flex: 1, padding: 24, gap: 12, paddingTop: 48 },
  pickerList: { flex: 1 },
  pickerRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
  },
});
