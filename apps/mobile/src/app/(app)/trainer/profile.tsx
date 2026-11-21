import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAppearance } from '@/brand/AppearanceProvider';
import { useBrand } from '@/brand/BrandProvider';
import { fetchJson } from '@/lib/api-client';
import { useSession } from '@/lib/session';
import type { TrainerProfile } from '@/lib/me-types';
import { Screen } from '@/ui/Screen';
import { Field } from '@/ui/Field';
import { Button } from '@/ui/Button';
import { ErrorText } from '@/ui/ErrorText';

export default function TrainerProfileScreen() {
  const { colors } = useBrand();
  const { editable } = useAppearance();
  const { apiContext, refreshMe } = useSession();
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchJson<{ profile: TrainerProfile }>(apiContext, '/v1/me/trainer-profile')
      .then((res) => {
        if (cancelled) return;
        setDisplayName(res.profile.displayName ?? '');
        setBio(res.profile.bio ?? '');
        setWhatsapp(res.profile.whatsappE164 ?? '');
      })
      .catch(() => {
        if (!cancelled) setError('No se pudo cargar el perfil.');
      });
    return () => {
      cancelled = true;
    };
  }, [apiContext]);

  const onSave = async () => {
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      await fetchJson(apiContext, '/v1/me/trainer-profile', {
        method: 'PATCH',
        body: JSON.stringify({
          displayName: displayName.trim() || undefined,
          bio: bio.trim() || null,
          whatsappE164: whatsapp.trim() || null,
        }),
      });
      await refreshMe();
      setSaved(true);
    } catch {
      setError('No se pudo guardar el perfil.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen title="Perfil de entrenador">
      <View style={styles.form}>
        <Field label="Nombre visible" value={displayName} onChangeText={setDisplayName} />
        <Field
          label="Bio"
          value={bio}
          onChangeText={setBio}
          multiline
          numberOfLines={4}
          style={{ minHeight: 100, textAlignVertical: 'top' }}
        />
        <Field
          label="WhatsApp (E.164)"
          placeholder="+54911..."
          value={whatsapp}
          onChangeText={setWhatsapp}
          autoCapitalize="none"
        />
        <ErrorText message={error} />
        {saved ? (
          <Text style={{ color: colors.success, fontSize: 16 }}>Perfil guardado.</Text>
        ) : null}
        <Button label="Guardar" onPress={onSave} loading={loading} />
        {editable ? (
          <Link href="/trainer/appearance" asChild>
            <Button label="Personalizar apariencia" variant="secondary" onPress={() => undefined} />
          </Link>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 14 },
});
