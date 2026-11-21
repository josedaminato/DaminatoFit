import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Linking, Text } from 'react-native';
import { useBrand } from '@/brand/BrandProvider';
import {
  getRecommendation,
  reportRecommendation,
  type RecommendationItem,
} from '@/features/recommendations/api';
import {
  RecommendationCard,
  RecommendationNotice,
  WhatsappDraft,
} from '@/features/recommendations/views';
import { useSession } from '@/lib/session';
import { Button } from '@/ui/Button';
import { Screen } from '@/ui/Screen';

const REASONS = [
  ['suspicious_link', 'Enlace sospechoso'],
  ['misleading', 'Engañosa'],
  ['fraudulent', 'Fraudulenta'],
  ['dangerous', 'Peligrosa'],
  ['inappropriate', 'Inapropiada'],
] as const;

export default function StudentRecommendationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useBrand();
  const { apiContext } = useSession();
  const [item, setItem] = useState<RecommendationItem | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    void getRecommendation(apiContext, id)
      .then(setItem)
      .catch(() => setMessage('No se encontró la recomendación.'));
  }, [apiContext, id]);

  return (
    <Screen title="Recomendación">
      <RecommendationNotice />
      {message ? <Text style={{ color: colors.text }}>{message}</Text> : null}
      {item ? (
        <>
          <RecommendationCard
            item={item}
            onOpen={(url) => {
              void Linking.openURL(url);
            }}
          />
          <WhatsappDraft item={item} />
          {item.destinationKind === 'whatsapp' ? (
            <Text style={{ color: colors.textMuted }}>
              El botón abre WhatsApp con el texto que dejes. No se envía solo.
            </Text>
          ) : null}
          {REASONS.map(([reason, label]) => (
            <Button
              key={reason}
              label={`Reportar: ${label}`}
              variant="secondary"
              onPress={() => {
                if (!id) return;
                void reportRecommendation(apiContext, id, { reason })
                  .then(() => setMessage('Recibimos tu reporte. Un administrador puede revisarlo.'))
                  .catch(() => setMessage('No se pudo enviar el reporte.'));
              }}
            />
          ))}
        </>
      ) : null}
    </Screen>
  );
}
