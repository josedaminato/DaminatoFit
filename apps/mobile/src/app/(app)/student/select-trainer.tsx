import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useBrand } from '@/brand/BrandProvider';
import { useSession } from '@/lib/session';
import { Screen } from '@/ui/Screen';

export default function SelectTrainerScreen() {
  const { colors } = useBrand();
  const { me, setActiveTenantId, isTrainer } = useSession();

  const memberships = me?.memberships.filter((m) => m.role === 'student') ?? [];

  if (isTrainer) {
    router.replace('/trainer');
    return null;
  }

  return (
    <Screen title="Elegir entrenador">
      <View style={styles.list}>
        {memberships.map((m) => (
          <Pressable
            key={m.id}
            accessibilityRole="button"
            onPress={() =>
              void setActiveTenantId(m.tenantId).then(() => router.replace('/student'))
            }
            style={({ pressed }) => [
              styles.row,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text style={{ color: colors.text, fontWeight: '600', fontSize: 17 }}>
              {m.tenantName}
            </Text>
            <Text style={{ color: colors.textMuted }}>{m.status}</Text>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  row: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 16,
    gap: 4,
  },
});
