import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBrand } from '@/brand/BrandProvider';
import { ApiStatus } from '@/features/health/ApiStatus';

export function HomeScreen() {
  const { brand, colors } = useBrand();

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.badge, { backgroundColor: colors.primary }]}>
        <Text style={[styles.badgeText, { color: colors.onPrimary }]}>{brand.displayName}</Text>
      </View>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
        Bienvenido a {brand.displayName}
      </Text>
      <Text style={[styles.subtitle, { color: colors.textMuted }]}>
        Base del proyecto lista. Las funcionalidades llegan en las próximas fases.
      </Text>
      <ApiStatus />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 24, gap: 16, justifyContent: 'center' },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  badgeText: { fontSize: 16, fontWeight: '700' },
  title: { fontSize: 28, fontWeight: '700' },
  subtitle: { fontSize: 17, lineHeight: 24 },
});
