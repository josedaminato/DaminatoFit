import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useBrand } from '@/brand/BrandProvider';
import { useSession } from '@/lib/session';
import { validationMessage } from '@/lib/validation';
import { Screen } from '@/ui/Screen';
import { Field } from '@/ui/Field';
import { Button } from '@/ui/Button';
import { ErrorText } from '@/ui/ErrorText';

export default function ForgotPasswordScreen() {
  const { brand, colors } = useBrand();
  const { authClient } = useSession();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const onSubmit = async () => {
    const emailError = validationMessage('email', email);
    if (emailError) {
      setError(emailError);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await authClient.requestPasswordReset({
        email: email.trim(),
        redirectTo: `${brand.scheme}://reset-password`,
      });
      setSent(true);
    } catch {
      setError('No se pudo enviar el correo. Revisá el email e intentá de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen title="Recuperar contraseña">
      <View style={styles.form}>
        <Text style={{ color: colors.textMuted, fontSize: 16 }}>
          Te enviaremos un enlace para restablecer tu contraseña.
        </Text>
        <Field
          label="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <ErrorText message={error} />
        {sent ? (
          <Text style={{ color: colors.success, fontSize: 16 }}>
            Si el email existe, recibirás instrucciones en tu bandeja.
          </Text>
        ) : (
          <Button label="Enviar enlace" onPress={onSubmit} loading={loading} />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 14 },
});
