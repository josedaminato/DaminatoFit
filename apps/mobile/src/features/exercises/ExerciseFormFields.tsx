import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useBrand } from '@/brand/BrandProvider';
import { Field } from '@/ui/Field';
import { Button } from '@/ui/Button';
import type { EquipmentItem, MuscleGroup } from './types';

export interface ExerciseFormValues {
  name: string;
  description: string;
  instructions: string;
  primaryMuscleGroupId: string | null;
  secondaryMuscleGroupIds: string[];
  equipmentId: string | null;
  videoLabel: string | null;
}

interface ExerciseFormFieldsProps {
  values: ExerciseFormValues;
  muscleGroups: MuscleGroup[];
  equipment: EquipmentItem[];
  onChange: (patch: Partial<ExerciseFormValues>) => void;
  onPickVideo: () => void;
  pickingVideo?: boolean;
}

export function ExerciseFormFields({
  values,
  muscleGroups,
  equipment,
  onChange,
  onPickVideo,
  pickingVideo,
}: ExerciseFormFieldsProps) {
  const { colors } = useBrand();

  const toggleSecondary = (id: string) => {
    const set = new Set(values.secondaryMuscleGroupIds);
    if (set.has(id)) set.delete(id);
    else if (set.size < 8) set.add(id);
    onChange({ secondaryMuscleGroupIds: [...set] });
  };

  return (
    <View style={styles.form}>
      <Field label="Nombre" value={values.name} onChangeText={(name) => onChange({ name })} />
      <Field
        label="Descripción"
        value={values.description}
        onChangeText={(description) => onChange({ description })}
        multiline
        numberOfLines={3}
        style={{ minHeight: 72, textAlignVertical: 'top' }}
      />
      <Field
        label="Instrucciones"
        value={values.instructions}
        onChangeText={(instructions) => onChange({ instructions })}
        multiline
        numberOfLines={5}
        style={{ minHeight: 120, textAlignVertical: 'top' }}
      />

      <Text style={[styles.section, { color: colors.text }]}>Músculo principal</Text>
      <View style={styles.chips}>
        <Pressable
          onPress={() => onChange({ primaryMuscleGroupId: null })}
          style={[
            styles.chip,
            {
              borderColor: colors.border,
              backgroundColor: !values.primaryMuscleGroupId ? colors.primary : colors.surface,
            },
          ]}
        >
          <Text style={{ color: !values.primaryMuscleGroupId ? colors.onPrimary : colors.text }}>
            Ninguno
          </Text>
        </Pressable>
        {muscleGroups.map((mg) => {
          const selected = values.primaryMuscleGroupId === mg.id;
          return (
            <Pressable
              key={mg.id}
              onPress={() =>
                onChange({
                  primaryMuscleGroupId: mg.id,
                  secondaryMuscleGroupIds: values.secondaryMuscleGroupIds.filter(
                    (s) => s !== mg.id,
                  ),
                })
              }
              style={[
                styles.chip,
                {
                  borderColor: colors.border,
                  backgroundColor: selected ? colors.primary : colors.surface,
                },
              ]}
            >
              <Text style={{ color: selected ? colors.onPrimary : colors.text }}>{mg.name}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.section, { color: colors.text }]}>Músculos secundarios (opcional)</Text>
      <View style={styles.chips}>
        {muscleGroups
          .filter((mg) => mg.id !== values.primaryMuscleGroupId)
          .map((mg) => {
            const selected = values.secondaryMuscleGroupIds.includes(mg.id);
            return (
              <Pressable
                key={mg.id}
                onPress={() => toggleSecondary(mg.id)}
                style={[
                  styles.chip,
                  {
                    borderColor: colors.border,
                    backgroundColor: selected ? colors.primary : colors.surface,
                  },
                ]}
              >
                <Text style={{ color: selected ? colors.onPrimary : colors.text }}>{mg.name}</Text>
              </Pressable>
            );
          })}
      </View>

      <Text style={[styles.section, { color: colors.text }]}>Equipamiento</Text>
      <View style={styles.chips}>
        <Pressable
          onPress={() => onChange({ equipmentId: null })}
          style={[
            styles.chip,
            {
              borderColor: colors.border,
              backgroundColor: !values.equipmentId ? colors.primary : colors.surface,
            },
          ]}
        >
          <Text style={{ color: !values.equipmentId ? colors.onPrimary : colors.text }}>
            Ninguno
          </Text>
        </Pressable>
        {equipment.map((item) => {
          const selected = values.equipmentId === item.id;
          return (
            <Pressable
              key={item.id}
              onPress={() => onChange({ equipmentId: item.id })}
              style={[
                styles.chip,
                {
                  borderColor: colors.border,
                  backgroundColor: selected ? colors.primary : colors.surface,
                },
              ]}
            >
              <Text style={{ color: selected ? colors.onPrimary : colors.text }}>{item.name}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.videoRow}>
        <Text style={{ color: colors.text, fontWeight: '600' }}>Video (opcional)</Text>
        <Text style={{ color: colors.textMuted }}>
          {values.videoLabel ?? 'Sin video seleccionado'}
        </Text>
        <Button
          label={values.videoLabel ? 'Cambiar video' : 'Elegir video'}
          variant="secondary"
          onPress={onPickVideo}
          loading={pickingVideo}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 12 },
  section: { fontSize: 15, fontWeight: '600', marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  videoRow: { gap: 8, marginTop: 4 },
});
