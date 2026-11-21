import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSession } from '@/lib/session';
import { validationMessage } from '@/lib/validation';
import { Screen } from '@/ui/Screen';
import { Field } from '@/ui/Field';
import { Button } from '@/ui/Button';
import { ErrorText } from '@/ui/ErrorText';

export default function SignInScreen() {
  const { authClient, refreshMe } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    const emailError = validationMessage('email', email);
    const passwordError = validationMessage('password', password);
    if (emailError || passwordError) {
      setError(emailError ?? passwordError);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await authClient.signIn.email({ email: email.trim(), password });
      if (result.error) {
        setError('Credenciales inválidas.');
        return;
      }
      await refreshMe();
      router.replace('/');
    } catch {
      setError('No se pudo iniciar sesión. Intentá de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen title="Iniciar sesión">
      <View style={styles.form}>
        <Field
          label="Email"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <Field
          label="Contraseña"
          secureTextEntry
          autoComplete="password"
          value={password}
          onChangeText={setPassword}
        />
        <ErrorText message={error} />
        <Button label="Entrar" onPress={onSubmit} loading={loading} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 14 },
});
