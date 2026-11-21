import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useBrand } from '@/brand/BrandProvider';
import { fetchJson } from '@/lib/api-client';
import { useSession } from '@/lib/session';
import type { TrainerProfile } from '@/lib/me-types';
import { Screen } from '@/ui/Screen';
import { Button } from '@/ui/Button';
import { ErrorText } from '@/ui/ErrorText';

export default function StudentContactScreen() {
  const { colors } = useBrand();
  const { apiContext } = useSession();
  const [profile, setProfile] = useState<TrainerProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchJson<{ profile: TrainerProfile }>(apiContext, '/v1/me/trainer-profile')
      .then((res) => {
        if (!cancelled) setProfile(res.profile);
      })
      .catch(() => {
        if (!cancelled) setError('No se pudo cargar el contacto del entrenador.');
      });
    return () => {
      cancelled = true;
    };
  }, [apiContext]);

  return (
    <Screen title="Contacto">
      {profile ? (
        <View style={styles.block}>
          <Text style={[styles.name, { color: colors.text }]}>{profile.displayName}</Text>
          {profile.bio ? (
            <Text style={{ color: colors.textMuted, fontSize: 16, lineHeight: 22 }}>
              {profile.bio}
            </Text>
          ) : null}
          {profile.whatsappUrl ? (
            <Button
              label="Escribir por WhatsApp"
              onPress={() => void Linking.openURL(profile.whatsappUrl!)}
            />
          ) : (
            <Text style={{ color: colors.textMuted }}>WhatsApp no configurado.</Text>
          )}
        </View>
      ) : null}
      <ErrorText message={error} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: { gap: 12 },
  name: { fontSize: 22, fontWeight: '700' },
});
