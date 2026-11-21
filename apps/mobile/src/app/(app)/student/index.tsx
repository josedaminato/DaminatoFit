import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useBrand } from '@/brand/BrandProvider';
import { useSession } from '@/lib/session';
import { Screen } from '@/ui/Screen';
import { Button } from '@/ui/Button';

export default function StudentHomeScreen() {
  const { colors } = useBrand();
  const { me, activeMembership } = useSession();

  return (
    <Screen title="Mi entrenamiento">
      <Text style={{ color: colors.textMuted, fontSize: 16 }}>
        Hola, {me?.user.displayName}. Entrenás con {activeMembership?.tenantName ?? 'tu entrenador'}
        .
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: 15 }}>
        Rutinas y videos llegarán en una próxima fase.
      </Text>
      <View style={styles.actions}>
        <Link href="/student/contact" asChild>
          <Button label="Contactar entrenador" onPress={() => undefined} />
        </Link>
        <Link href="/student/select-trainer" asChild>
          <Button label="Cambiar espacio" variant="secondary" onPress={() => undefined} />
        </Link>
        <Link href="/settings" asChild>
          <Button label="Ajustes" variant="secondary" onPress={() => undefined} />
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { gap: 12, marginTop: 8 },
});
