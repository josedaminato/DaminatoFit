import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ExerciseFormFields,
  type ExerciseFormValues,
} from '@/features/exercises/ExerciseFormFields';
import {
  getExercise,
  listEquipment,
  listMuscleGroups,
  updateExercise,
  uploadExerciseVideo,
} from '@/features/exercises/exercise-api';
import { pickExerciseVideo } from '@/features/exercises/pickVideo';
import type { EquipmentItem, MuscleGroup } from '@/features/exercises/types';
import { validateExerciseWrite } from '@/features/exercises/types';
import { useSession } from '@/lib/session';
import { Screen } from '@/ui/Screen';
import { Button } from '@/ui/Button';
import { ErrorText } from '@/ui/ErrorText';

export default function TrainerEditExerciseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const exerciseId = typeof id === 'string' ? id : '';
  const { apiContext } = useSession();
  const router = useRouter();

  const [values, setValues] = useState<ExerciseFormValues | null>(null);
  const [existingVideoMediaId, setExistingVideoMediaId] = useState<string | null>(null);
  const [muscleGroups, setMuscleGroups] = useState<MuscleGroup[]>([]);
  const [equipment, setEquipment] = useState<EquipmentItem[]>([]);
  const [loading, setLoading] = useState(Boolean(exerciseId));
  const [saving, setSaving] = useState(false);
  const [pickingVideo, setPickingVideo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingVideo, setPendingVideo] = useState<{
    uri: string;
    contentType: 'video/mp4' | 'video/quicktime';
    size: number;
    name: string;
  } | null>(null);

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
        if (ex.scope !== 'tenant') {
          setError('Solo podés editar ejercicios propios.');
          setValues(null);
          return;
        }
        setMuscleGroups(muscles);
        setEquipment(equip);
        setExistingVideoMediaId(ex.revision.videoMediaId);
        setValues({
          name: ex.revision.name,
          description: ex.revision.description,
          instructions: ex.revision.instructions,
          primaryMuscleGroupId: ex.revision.primaryMuscleGroupId,
          secondaryMuscleGroupIds: ex.revision.secondaryMuscleGroupIds,
          equipmentId: ex.revision.equipmentId,
          videoLabel: ex.revision.videoMediaId ? 'Video actual' : null,
        });
        setError(null);
      } catch {
        if (!cancelled) setError('No se pudo cargar el ejercicio.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiContext, exerciseId]);

  const onPickVideo = async () => {
    setPickingVideo(true);
    setError(null);
    try {
      const picked = await pickExerciseVideo();
      if (!picked) return;
      if (picked.size == null || picked.size <= 0) {
        setError('No se pudo determinar el tamaño del archivo.');
        return;
      }
      setPendingVideo({
        uri: picked.uri,
        contentType: picked.contentType,
        size: picked.size,
        name: picked.name,
      });
      setValues((v) => (v ? { ...v, videoLabel: picked.name } : v));
    } catch (e) {
      if (e instanceof Error && e.message === 'invalid_video_type') {
        setError('Solo se permiten videos MP4 o MOV.');
      } else {
        setError('No se pudo seleccionar el video.');
      }
    } finally {
      setPickingVideo(false);
    }
  };

  const onSave = async () => {
    if (!values || !exerciseId) return;
    const validationError = validateExerciseWrite(values);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let videoMediaId = existingVideoMediaId;
      if (pendingVideo) {
        videoMediaId = await uploadExerciseVideo(
          apiContext,
          pendingVideo.uri,
          pendingVideo.contentType,
          pendingVideo.size,
        );
      }

      await updateExercise(apiContext, exerciseId, {
        name: values.name.trim(),
        description: values.description.trim(),
        instructions: values.instructions.trim(),
        primaryMuscleGroupId: values.primaryMuscleGroupId,
        secondaryMuscleGroupIds: values.secondaryMuscleGroupIds,
        equipmentId: values.equipmentId,
        videoMediaId,
      });
      router.replace(`/trainer/exercises/${exerciseId}`);
    } catch {
      setError('No se pudo guardar los cambios.');
    } finally {
      setSaving(false);
    }
  };

  if (!exerciseId) {
    return (
      <Screen title="Editar ejercicio">
        <ErrorText message="Identificador inválido." />
        <Button label="Volver" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  if (loading) {
    return (
      <Screen title="Editar ejercicio">
        <ErrorText message="Cargando…" />
      </Screen>
    );
  }

  if (!values) {
    return (
      <Screen title="Editar ejercicio">
        <ErrorText message={error ?? 'No se puede editar este ejercicio.'} />
        <Button label="Volver" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen title="Editar ejercicio">
      <ExerciseFormFields
        values={values}
        muscleGroups={muscleGroups}
        equipment={equipment}
        onChange={(patch) => setValues((v) => (v ? { ...v, ...patch } : v))}
        onPickVideo={() => void onPickVideo()}
        pickingVideo={pickingVideo}
      />
      <ErrorText message={error} />
      <View style={{ gap: 12 }}>
        <Button label="Guardar cambios" onPress={() => void onSave()} loading={saving} />
        <Button label="Cancelar" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
