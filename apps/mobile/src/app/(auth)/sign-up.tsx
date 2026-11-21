import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useBrand } from '@/brand/BrandProvider';
import { fetchJson } from '@/lib/api-client';
import { useSession } from '@/lib/session';
import { validationMessage } from '@/lib/validation';
import { Screen } from '@/ui/Screen';
import { Field } from '@/ui/Field';
import { Button } from '@/ui/Button';
import { ErrorText } from '@/ui/ErrorText';

export default function SignUpScreen() {
  const { brand } = useBrand();
  const { apiContext, authClient, refreshMe, setActiveTenantId } = useSession();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (brand.trainerSignup !== 'open') router.replace('/welcome');
  }, [brand.trainerSignup]);

  const onSubmit = async () => {
    const errors = [
      validationMessage('name', name),
      validationMessage('email', email),
      validationMessage('password', password),
      validationMessage('businessName', businessName),
    ].find(Boolean);
    if (errors) {
      setError(errors);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const body = {
        name: name.trim(),
        email: email.trim(),
        password,
        businessName: businessName.trim(),
      };
      const result = await fetchJson<{ tenantId?: string }>(
        { ...apiContext, activeTenantId: null },
        '/v1/trainers/register',
        { method: 'POST', body: JSON.stringify(body) },
      );
      const signInResult = await authClient.signIn.email({
        email: body.email,
        password: body.password,
      });
      if (signInResult.error) {
        setError('Cuenta creada, pero no se pudo iniciar sesión automáticamente.');
        return;
      }
      if (result.tenantId) {
        await setActiveTenantId(result.tenantId);
      }
      await refreshMe();
      router.replace('/');
    } catch {
      setError('No se pudo crear la cuenta. Verificá los datos e intentá de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  if (brand.trainerSignup !== 'open') return null;

  return (
    <Screen title="Registro de entrenador">
      <View style={styles.form}>
        <Field label="Nombre" value={name} onChangeText={setName} />
        <Field
          label="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <Field label="Contraseña" secureTextEntry value={password} onChangeText={setPassword} />
        <Field label="Nombre del negocio" value={businessName} onChangeText={setBusinessName} />
        <ErrorText message={error} />
        <Button label="Crear cuenta" onPress={onSubmit} loading={loading} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 14 },
});
