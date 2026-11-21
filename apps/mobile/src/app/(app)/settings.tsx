import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useBrand } from '@/brand/BrandProvider';
import { ApiStatus } from '@/features/health/ApiStatus';
import { SupportContact } from '@/features/support/SupportContact';
import { useSession } from '@/lib/session';
import { getApiUrl } from '@/lib/api';
import { fetchJson } from '@/lib/api-client';
import { validationMessage } from '@/lib/validation';
import { Screen } from '@/ui/Screen';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { ErrorText } from '@/ui/ErrorText';

export default function SettingsScreen() {
  const { brand, colors } = useBrand();
  const { me, signOut, isTrainer, apiContext, authClient } = useSession();
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(false);

  const onSignOut = async () => {
    await signOut();
    router.replace('/welcome');
  };

  const onDelete = () => {
    Alert.alert(
      'Eliminar cuenta',
      'Se cerrarán tus sesiones y se archivará tu espacio. Esta acción no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Continuar', style: 'destructive', onPress: () => setShowDelete(true) },
      ],
    );
  };

  const confirmDelete = async () => {
    const passwordError = validationMessage('password', password);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    if (confirmText.trim() !== 'ELIMINAR') {
      setError('Escribí ELIMINAR para confirmar.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await fetchJson(apiContext, '/v1/me/account/delete', {
        method: 'POST',
        body: JSON.stringify({ password, confirm: 'ELIMINAR' }),
      });
      try {
        await authClient.signOut();
      } catch {
        // Session already revoked server-side.
      }
      await signOut();
      router.replace('/welcome');
    } catch {
      setError('No se pudo eliminar la cuenta. Revisá la contraseña e intentá de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen title="Ajustes" scroll>
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
      <SupportContact />
      <Text style={{ color: colors.textMuted, fontSize: 14 }}>{brand.displayName}</Text>
      <Button label="Cerrar sesión" variant="secondary" onPress={() => void onSignOut()} />

      <View style={styles.dangerZone}>
        <Text style={[styles.sectionTitle, { color: colors.danger }]}>Zona sensible</Text>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>
          Eliminar la cuenta borra tu acceso en {brand.displayName}. No elimina el historial de
          otras personas en espacios donde entrenaste.
        </Text>
        {!showDelete ? (
          <Button label="Eliminar mi cuenta" variant="danger" onPress={onDelete} />
        ) : (
          <View style={styles.form}>
            <Field
              label="Contraseña actual"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            <Field
              label="Escribí ELIMINAR para confirmar"
              value={confirmText}
              onChangeText={setConfirmText}
              autoCapitalize="characters"
            />
            <ErrorText message={error} />
            <Button
              label="Confirmar eliminación"
              variant="danger"
              loading={loading}
              onPress={() => void confirmDelete()}
            />
            <Button
              label="Cancelar"
              variant="secondary"
              onPress={() => {
                setShowDelete(false);
                setPassword('');
                setConfirmText('');
                setError(null);
              }}
            />
          </View>
        )}
      </View>
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
  dangerZone: { gap: 10, marginTop: 8 },
  form: { gap: 12 },
});
