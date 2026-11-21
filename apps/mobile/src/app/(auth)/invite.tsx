import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useBrand } from '@/brand/BrandProvider';
import { fetchJson } from '@/lib/api-client';
import { useSession } from '@/lib/session';
import { validationMessage } from '@/lib/validation';
import { Screen } from '@/ui/Screen';
import { Field } from '@/ui/Field';
import { Button } from '@/ui/Button';
import { ErrorText } from '@/ui/ErrorText';

interface InvitePreview {
  email: string;
  trainerName: string;
  brandId: string;
  status: string;
  expiresAt: string;
}

export default function InviteScreen() {
  const { colors } = useBrand();
  const { token: tokenParam } = useLocalSearchParams<{ token?: string | string[] }>();
  const token = Array.isArray(tokenParam) ? tokenParam[0] : tokenParam;
  const { apiContext, refreshMe, setActiveTenantId, isAuthenticated, me } = useSession();

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tokenError = token ? null : 'Enlace de invitación inválido.';

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchJson<InvitePreview>(
          { ...apiContext, activeTenantId: null },
          `/v1/invitations/preview?token=${encodeURIComponent(token)}`,
        );
        if (cancelled) return;
        setPreview(data);
        if (data.status !== 'pending') {
          setLoadError(`Invitación ${data.status}.`);
        }
      } catch {
        if (!cancelled) setLoadError('No se encontró la invitación.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, apiContext]);

  const acceptInvite = async (body: { token: string; name?: string; password?: string }) => {
    const result = await fetchJson<{ tenantId?: string }>(
      { ...apiContext, activeTenantId: null },
      '/v1/invitations/accept',
      { method: 'POST', body: JSON.stringify(body) },
    );
    if (result.tenantId) await setActiveTenantId(result.tenantId);
    await refreshMe();
    router.replace('/student');
  };

  const onAcceptNew = async () => {
    if (!token) return;
    const errors = [validationMessage('name', name), validationMessage('password', password)].find(
      Boolean,
    );
    if (errors) {
      setError(errors);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await acceptInvite({ token, name: name.trim(), password });
    } catch {
      setError('No se pudo aceptar la invitación.');
    } finally {
      setLoading(false);
    }
  };

  const onAcceptExisting = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      await acceptInvite({ token, name: me?.user.displayName });
    } catch {
      setError('Debés iniciar sesión con el email de la invitación o crear una contraseña.');
    } finally {
      setLoading(false);
    }
  };

  const displayError = tokenError ?? loadError ?? error;

  return (
    <Screen title="Invitación">
      <ErrorText message={displayError} />
      {preview ? (
        <View style={styles.block}>
          <Text style={{ color: colors.text, fontSize: 17 }}>
            {preview.trainerName} te invitó a entrenar ({preview.email})
          </Text>
        </View>
      ) : null}

      {isAuthenticated && preview?.status === 'pending' ? (
        <Button label="Aceptar con mi cuenta" onPress={onAcceptExisting} loading={loading} />
      ) : preview?.status === 'pending' ? (
        <View style={styles.form}>
          <Field label="Nombre" value={name} onChangeText={setName} />
          <Field label="Contraseña" secureTextEntry value={password} onChangeText={setPassword} />
          <Button label="Crear cuenta y unirme" onPress={onAcceptNew} loading={loading} />
        </View>
      ) : null}

      {!isAuthenticated && preview?.status === 'pending' ? (
        <Button
          label="Ya tengo cuenta"
          variant="secondary"
          onPress={() =>
            router.push({ pathname: '/sign-in', params: { next: `/invite?token=${token}` } })
          }
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: { marginBottom: 8 },
  form: { gap: 14 },
});
