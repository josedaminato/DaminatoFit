import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useBrand } from '@/brand/BrandProvider';
import { ExerciseVideo } from '@/features/exercises/ExerciseVideo';
import {
  archiveExercise,
  customizeExercise,
  getExercise,
  listEquipment,
  listMuscleGroups,
} from '@/features/exercises/exercise-api';
import {
  scopeBadgeLabel,
  type EquipmentItem,
  type Exercise,
  type MuscleGroup,
} from '@/features/exercises/types';
import { useSession } from '@/lib/session';
import { Screen } from '@/ui/Screen';
import { Field } from '@/ui/Field';
import { Button } from '@/ui/Button';
import { ErrorText } from '@/ui/ErrorText';

export default function TrainerExerciseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const exerciseId = typeof id === 'string' ? id : '';
  const { colors } = useBrand();
  const { apiContext } = useSession();
  const router = useRouter();

  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [muscleGroups, setMuscleGroups] = useState<MuscleGroup[]>([]);
  const [equipment, setEquipment] = useState<EquipmentItem[]>([]);
  const [loading, setLoading] = useState(Boolean(exerciseId));
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const [customName, setCustomName] = useState('');
  const [customDescription, setCustomDescription] = useState('');
  const [customInstructions, setCustomInstructions] = useState('');
  const [showCustomize, setShowCustomize] = useState(false);

  const requestReload = useCallback(() => {
    setLoading(true);
    setReloadToken((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!exerciseId) return;
    let cancelled = false;
    void (async () => {
      try {
        const [ex, muscles, equip] = await Promise.all([
          getExercise(apiContext, exerciseId),
          listMuscleGroups(apiContext),
          listEquipment(apiContext),
        ]);
        if (cancelled) return;
        setExercise(ex);
        setMuscleGroups(muscles);
        setEquipment(equip);
        setCustomName(ex.revision.name);
        setCustomDescription(ex.revision.description);
        setCustomInstructions(ex.revision.instructions);
        setError(null);
      } catch {
        if (cancelled) return;
        setError('No se pudo cargar el ejercicio.');
        setExercise(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiContext, exerciseId, reloadToken]);

  const muscleName = useMemo(() => {
    if (!exercise?.revision.primaryMuscleGroupId) return '—';
    return muscleGroups.find((m) => m.id === exercise.revision.primaryMuscleGroupId)?.name ?? '—';
  }, [exercise, muscleGroups]);

  const equipmentName = useMemo(() => {
    if (!exercise?.revision.equipmentId) return '—';
    return equipment.find((e) => e.id === exercise.revision.equipmentId)?.name ?? '—';
  }, [exercise, equipment]);

  const secondaryNames = useMemo(() => {
    if (!exercise) return [];
    return exercise.revision.secondaryMuscleGroupIds
      .map((sid) => muscleGroups.find((m) => m.id === sid)?.name)
      .filter((n): n is string => Boolean(n));
  }, [exercise, muscleGroups]);

  const onCustomize = async () => {
    if (!exercise || exercise.scope !== 'global') return;
    if (!customName.trim()) {
      setError('El nombre es obligatorio.');
      return;
    }
    setActionLoading(true);
    setError(null);
    try {
      const created = await customizeExercise(apiContext, exercise.id, {
        name: customName.trim(),
        description: customDescription.trim(),
        instructions: customInstructions.trim(),
      });
      router.replace(`/trainer/exercises/${created.id}`);
    } catch {
      setError('No se pudo personalizar el ejercicio.');
    } finally {
      setActionLoading(false);
    }
  };

  const onArchive = async () => {
    if (!exercise || exercise.scope !== 'tenant') return;
    setActionLoading(true);
    setError(null);
    try {
      await archiveExercise(apiContext, exercise.id);
      requestReload();
    } catch {
      setError('No se pudo archivar el ejercicio.');
    } finally {
      setActionLoading(false);
    }
  };

  if (!exerciseId) {
    return (
      <Screen title="Ejercicio">
        <ErrorText message="Identificador inválido." />
      </Screen>
    );
  }

  if (loading) {
    return (
      <Screen title="Ejercicio">
        <Text style={{ color: colors.textMuted }}>Cargando…</Text>
      </Screen>
    );
  }

  if (!exercise) {
    return (
      <Screen title="Ejercicio">
        <ErrorText message={error ?? 'Ejercicio no encontrado.'} />
        <Button label="Volver" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  const isGlobal = exercise.scope === 'global';
  const isOwn = exercise.scope === 'tenant';

  return (
    <Screen title={exercise.revision.name}>
      <View style={styles.meta}>
        <Text style={{ color: colors.textMuted }}>Ámbito: {scopeBadgeLabel(exercise.scope)}</Text>
        {exercise.basedOnExerciseId ? (
          <Text style={{ color: colors.textMuted }}>Basado en ejercicio global</Text>
        ) : null}
      </View>

      {exercise.revision.description ? (
        <Text style={{ color: colors.text }}>{exercise.revision.description}</Text>
      ) : null}

      <View style={styles.block}>
        <Text style={[styles.label, { color: colors.text }]}>Instrucciones</Text>
        <Text style={{ color: colors.textMuted }}>
          {exercise.revision.instructions.trim() || 'Sin instrucciones.'}
        </Text>
      </View>

      <View style={styles.block}>
        <Text style={[styles.label, { color: colors.text }]}>Músculo principal</Text>
        <Text style={{ color: colors.textMuted }}>{muscleName}</Text>
      </View>

      {secondaryNames.length > 0 ? (
        <View style={styles.block}>
          <Text style={[styles.label, { color: colors.text }]}>Músculos secundarios</Text>
          <Text style={{ color: colors.textMuted }}>{secondaryNames.join(', ')}</Text>
        </View>
      ) : null}

      <View style={styles.block}>
        <Text style={[styles.label, { color: colors.text }]}>Equipamiento</Text>
        <Text style={{ color: colors.textMuted }}>{equipmentName}</Text>
      </View>

      <ExerciseVideo mediaId={exercise.revision.videoMediaId} apiContext={apiContext} />

      <ErrorText message={error} />

      {isGlobal ? (
        <View style={styles.actions}>
          {!showCustomize ? (
            <Button label="Personalizar para mi espacio" onPress={() => setShowCustomize(true)} />
          ) : (
            <View style={styles.form}>
              <Field label="Nombre" value={customName} onChangeText={setCustomName} />
              <Field
                label="Descripción"
                value={customDescription}
                onChangeText={setCustomDescription}
                multiline
              />
              <Field
                label="Instrucciones"
                value={customInstructions}
                onChangeText={setCustomInstructions}
                multiline
                style={{ minHeight: 100, textAlignVertical: 'top' }}
              />
              <Button
                label="Crear copia personalizada"
                onPress={() => void onCustomize()}
                loading={actionLoading}
              />
              <Button
                label="Cancelar"
                variant="secondary"
                onPress={() => setShowCustomize(false)}
              />
            </View>
          )}
        </View>
      ) : null}

      {isOwn && !exercise.archivedAt ? (
        <View style={styles.actions}>
          <Link href={`/trainer/exercises/edit?id=${exercise.id}`} asChild>
            <Button label="Editar" variant="secondary" onPress={() => undefined} />
          </Link>
          <Button
            label="Archivar"
            variant="danger"
            onPress={() => void onArchive()}
            loading={actionLoading}
          />
        </View>
      ) : null}

      {exercise.archivedAt ? (
        <Text style={{ color: colors.danger }}>Este ejercicio está archivado.</Text>
      ) : null}

      <Button label="Volver a la biblioteca" variant="secondary" onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  meta: { gap: 4 },
  block: { gap: 4 },
  label: { fontSize: 16, fontWeight: '600' },
  actions: { gap: 12 },
  form: { gap: 12 },
});
