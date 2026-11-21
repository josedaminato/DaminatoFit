import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useBrand } from '@/brand/BrandProvider';
import { useSession } from '@/lib/session';
import { isValidPassword, passwordsMatch, validationMessage } from '@/lib/validation';
import { Screen } from '@/ui/Screen';
import { Field } from '@/ui/Field';
import { Button } from '@/ui/Button';
import { ErrorText } from '@/ui/ErrorText';

export default function ResetPasswordScreen() {
  const { colors } = useBrand();
  const { authClient } = useSession();
  const params = useLocalSearchParams<{ token?: string | string[]; error?: string | string[] }>();
  const token = Array.isArray(params.token) ? params.token[0] : params.token;
  const linkError = Array.isArray(params.error) ? params.error[0] : params.error;

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const invalidLink = useMemo(() => {
    if (linkError) return 'El enlace no es válido o expiró.';
    if (!token) return 'Falta el token de recuperación.';
    return null;
  }, [linkError, token]);

  const onSubmit = async () => {
    if (invalidLink || !token) {
      setError(invalidLink);
      return;
    }
    const passwordError = validationMessage('password', password);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    if (!passwordsMatch(password, confirm)) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    if (!isValidPassword(password)) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { error: resetError } = await authClient.resetPassword({
        newPassword: password,
        token,
      });
      if (resetError) {
        setError('No se pudo restablecer. El enlace puede haber vencido o ya usarse.');
        return;
      }
      setDone(true);
    } catch {
      setError('No se pudo restablecer. El enlace puede haber vencido o ya usarse.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen title="Nueva contraseña">
      <View style={styles.form}>
        {invalidLink ? (
          <ErrorText message={invalidLink} />
        ) : done ? (
          <>
            <Text style={{ color: colors.success, fontSize: 16 }}>
              Contraseña actualizada. Ya podés iniciar sesión.
            </Text>
            <Button label="Ir a iniciar sesión" onPress={() => router.replace('/sign-in')} />
          </>
        ) : (
          <>
            <Text style={{ color: colors.textMuted, fontSize: 16 }}>
              Elegí una contraseña nueva para tu cuenta.
            </Text>
            <Field
              label="Nueva contraseña"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            <Field
              label="Confirmar contraseña"
              secureTextEntry
              value={confirm}
              onChangeText={setConfirm}
            />
            <ErrorText message={error} />
            <Button label="Guardar contraseña" onPress={onSubmit} loading={loading} />
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 14 },
});
