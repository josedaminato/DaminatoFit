import { Link, router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useBrand } from '@/brand/BrandProvider';
import { ApiStatus } from '@/features/health/ApiStatus';
import { useSession } from '@/lib/session';
import { getApiUrl } from '@/lib/api';
import { Screen } from '@/ui/Screen';
import { Button } from '@/ui/Button';

export default function SettingsScreen() {
  const { brand, colors } = useBrand();
  const { me, signOut, isTrainer } = useSession();

  return (
    <Screen title="Ajustes">
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={{ color: colors.text, fontWeight: '600' }}>{me?.user.displayName}</Text>
        <Text style={{ color: colors.textMuted }}>{me?.user.email}</Text>
      </View>
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Sistema</Text>
        <ApiStatus />
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>API: {getApiUrl()}</Text>
      </View>
      {isTrainer ? (
        <Link href="/trainer/profile" asChild>
          <Button label="Mi perfil de entrenador" variant="secondary" onPress={() => undefined} />
        </Link>
      ) : null}
      <Text style={{ color: colors.textMuted, fontSize: 14 }}>{brand.displayName}</Text>
      <Button
        label="Cerrar sesión"
        variant="danger"
        onPress={() => void signOut().then(() => router.replace('/welcome'))}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    gap: 4,
  },
  section: { gap: 8 },
  sectionTitle: { fontSize: 17, fontWeight: '600' },
});
