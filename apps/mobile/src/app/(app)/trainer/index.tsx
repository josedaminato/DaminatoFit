import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useBrand } from '@/brand/BrandProvider';
import { useSession } from '@/lib/session';
import { Screen } from '@/ui/Screen';
import { Button } from '@/ui/Button';

export default function TrainerHomeScreen() {
  const { colors } = useBrand();
  const { me, activeMembership } = useSession();

  return (
    <Screen title="Panel de entrenador">
      <Text style={{ color: colors.textMuted, fontSize: 16 }}>
        Hola, {me?.user.displayName}. Espacio activo: {activeMembership?.tenantName ?? '—'}
      </Text>
      <View style={styles.actions}>
        <Link href="/trainer/exercises" asChild>
          <Button label="Biblioteca de ejercicios" onPress={() => undefined} />
        </Link>
        <Link href="/trainer/students" asChild>
          <Button label="Alumnos e invitaciones" onPress={() => undefined} />
        </Link>
        <Link href="/trainer/routines" asChild>
          <Button label="Rutinas" onPress={() => undefined} />
        </Link>
        <Link href="/trainer/communications" asChild>
          <Button label="Comunicaciones" onPress={() => undefined} />
        </Link>
        <Link href="/trainer/recommendations" asChild>
          <Button label="Mis recomendaciones" onPress={() => undefined} />
        </Link>
        <Link href="/trainer/profile" asChild>
          <Button label="Perfil público" variant="secondary" onPress={() => undefined} />
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
