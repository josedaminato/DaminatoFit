import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  ExerciseFormFields,
  type ExerciseFormValues,
} from '@/features/exercises/ExerciseFormFields';
import {
  createExercise,
  listEquipment,
  listMuscleGroups,
  uploadExerciseVideo,
} from '@/features/exercises/exercise-api';
import { pickExerciseVideo } from '@/features/exercises/pickVideo';
import type { EquipmentItem, MuscleGroup } from '@/features/exercises/types';
import { validateExerciseWrite } from '@/features/exercises/types';
import { useSession } from '@/lib/session';
import { Screen } from '@/ui/Screen';
import { Button } from '@/ui/Button';
import { ErrorText } from '@/ui/ErrorText';

const emptyForm: ExerciseFormValues = {
  name: '',
  description: '',
  instructions: '',
  primaryMuscleGroupId: null,
  secondaryMuscleGroupIds: [],
  equipmentId: null,
  videoLabel: null,
};

export default function TrainerCreateExerciseScreen() {
  const { apiContext } = useSession();
  const router = useRouter();

  const [values, setValues] = useState<ExerciseFormValues>(emptyForm);
  const [muscleGroups, setMuscleGroups] = useState<MuscleGroup[]>([]);
  const [equipment, setEquipment] = useState<EquipmentItem[]>([]);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pickingVideo, setPickingVideo] = useState(false);
  const [pendingVideo, setPendingVideo] = useState<{
    uri: string;
    contentType: 'video/mp4' | 'video/quicktime';
    size: number;
    name: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [muscles, equip] = await Promise.all([
          listMuscleGroups(apiContext),
          listEquipment(apiContext),
        ]);
        if (!cancelled) {
          setMuscleGroups(muscles);
          setEquipment(equip);
        }
      } catch {
        if (!cancelled) setMetaError('No se pudo cargar catálogos.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiContext]);

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
      setValues((v) => ({ ...v, videoLabel: picked.name }));
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

  const onSubmit = async () => {
    const validationError = validateExerciseWrite(values);
    if (validationError) {
      setError(validationError);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let videoMediaId: string | null = null;
      if (pendingVideo) {
        videoMediaId = await uploadExerciseVideo(
          apiContext,
          pendingVideo.uri,
          pendingVideo.contentType,
          pendingVideo.size,
        );
      }

      const created = await createExercise(apiContext, {
        name: values.name.trim(),
        description: values.description.trim(),
        instructions: values.instructions.trim(),
        primaryMuscleGroupId: values.primaryMuscleGroupId,
        secondaryMuscleGroupIds: values.secondaryMuscleGroupIds,
        equipmentId: values.equipmentId,
        videoMediaId,
      });
      router.replace(`/trainer/exercises/${created.id}`);
    } catch {
      setError('No se pudo crear el ejercicio.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen title="Nuevo ejercicio">
      <ExerciseFormFields
        values={values}
        muscleGroups={muscleGroups}
        equipment={equipment}
        onChange={(patch) => setValues((v) => ({ ...v, ...patch }))}
        onPickVideo={() => void onPickVideo()}
        pickingVideo={pickingVideo}
      />
      <ErrorText message={metaError} />
      <ErrorText message={error} />
      <View style={{ gap: 12 }}>
        <Button label="Guardar" onPress={() => void onSubmit()} loading={loading} />
        <Button label="Cancelar" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
