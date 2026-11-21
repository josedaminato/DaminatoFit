import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useBrand } from '@/brand/BrandProvider';
import { Screen } from '@/ui/Screen';
import { Button } from '@/ui/Button';

export default function WelcomeScreen() {
  const { brand, colors } = useBrand();
  const signupOpen = brand.trainerSignup === 'open';

  return (
    <Screen title={`Bienvenido`} scroll={false}>
      <View style={[styles.badge, { backgroundColor: colors.primary }]}>
        <Text style={[styles.badgeText, { color: colors.onPrimary }]}>{brand.displayName}</Text>
      </View>
      <Text style={[styles.lead, { color: colors.textMuted }]}>
        Entrená con tu equipo o gestioná tus alumnos desde un solo lugar.
      </Text>
      <View style={styles.actions}>
        <Link href="/sign-in" asChild>
          <Button label="Iniciar sesión" onPress={() => undefined} />
        </Link>
        {signupOpen ? (
          <Link href="/sign-up" asChild>
            <Button
              label="Crear cuenta de entrenador"
              variant="secondary"
              onPress={() => undefined}
            />
          </Link>
        ) : (
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            ¿Sos alumno? Usá el enlace de invitación que te envió tu entrenador.
          </Text>
        )}
        <Link href="/forgot-password" asChild>
          <Button label="¿Olvidaste tu contraseña?" variant="secondary" onPress={() => undefined} />
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  badgeText: { fontSize: 16, fontWeight: '700' },
  lead: { fontSize: 17, lineHeight: 24 },
  actions: { gap: 12, marginTop: 8 },
  hint: { fontSize: 15, lineHeight: 22 },
});
