import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useBrand } from '@/brand/BrandProvider';
import { openWhatsapp, whatsappUrl } from '@/features/communications/whatsapp';
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
  const [whatsappNote, setWhatsappNote] = useState<string | null>(null);

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
          {profile.whatsappUrl || whatsappUrl(profile.whatsappE164) ? (
            <Button
              label="Contactar a mi entrenador"
              onPress={() => {
                const url = profile.whatsappUrl ?? whatsappUrl(profile.whatsappE164);
                void openWhatsapp(url).then((result) => {
                  if (result === 'unavailable') {
                    setWhatsappNote(
                      'No se pudo abrir WhatsApp. Probá de nuevo o escribinos desde el navegador con el mismo número.',
                    );
                  }
                });
              }}
            />
          ) : (
            <Text style={{ color: colors.textMuted }}>
              Tu entrenador todavía no cargó un WhatsApp.
            </Text>
          )}
          {whatsappNote ? <Text style={{ color: colors.textMuted }}>{whatsappNote}</Text> : null}
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
