import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useBrand } from '@/brand/BrandProvider';
import type { Exercise } from './types';
import { scopeBadgeLabel } from './types';

interface ExerciseCardProps {
  exercise: Exercise;
  onPress?: () => void;
  subtitle?: string | null;
}

export function ExerciseCard({ exercise, onPress, subtitle }: ExerciseCardProps) {
  const { colors } = useBrand();
  const badge = scopeBadgeLabel(exercise.scope);

  const content = (
    <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <View style={styles.header}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={2}>
          {exercise.revision.name}
        </Text>
        <View
          style={[
            styles.badge,
            {
              backgroundColor: exercise.scope === 'global' ? colors.primary : colors.border,
            },
          ]}
        >
          <Text
            style={{
              color: exercise.scope === 'global' ? colors.onPrimary : colors.text,
              fontSize: 12,
              fontWeight: '600',
            }}
          >
            {badge}
          </Text>
        </View>
      </View>
      {exercise.revision.description ? (
        <Text style={{ color: colors.textMuted }} numberOfLines={2}>
          {exercise.revision.description}
        </Text>
      ) : null}
      {subtitle ? (
        <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 4 }}>{subtitle}</Text>
      ) : null}
      {exercise.archivedAt ? (
        <Text style={{ color: colors.danger, fontSize: 13, marginTop: 4 }}>Archivado</Text>
      ) : null}
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  name: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
  },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
});
