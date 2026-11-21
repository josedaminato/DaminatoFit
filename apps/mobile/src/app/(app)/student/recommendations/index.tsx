import { useCallback, useState } from 'react';
import { Link, useFocusEffect } from 'expo-router';
import { Linking, Text } from 'react-native';
import {
  listPublishedRecommendations,
  type RecommendationItem,
} from '@/features/recommendations/api';
import { RecommendationCard, RecommendationNotice } from '@/features/recommendations/views';
import { useSession } from '@/lib/session';
import { Button } from '@/ui/Button';
import { ErrorText } from '@/ui/ErrorText';
import { Screen } from '@/ui/Screen';

export default function StudentRecommendationsScreen() {
  const { apiContext } = useSession();
  const [items, setItems] = useState<RecommendationItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    void listPublishedRecommendations(apiContext)
      .then((data) => {
        if (!cancelled) setItems(data.items);
      })
      .catch(() => {
        if (!cancelled) setError('No se pudieron cargar las recomendaciones.');
      });
    return () => {
      cancelled = true;
    };
  }, [apiContext]);

  useFocusEffect(load);

  return (
    <Screen title="Recomendaciones de mi entrenador">
      <RecommendationNotice />
      {error ? <ErrorText message={error} /> : null}
      {items.length === 0 ? (
        <Text>Tu entrenador todavía no publicó recomendaciones.</Text>
      ) : (
        items.map((item) => (
          <RecommendationCard
            key={item.id}
            item={item}
            onOpen={(url) => {
              if (item.destinationKind === 'whatsapp') return;
              void Linking.openURL(url);
            }}
          />
        ))
      )}
      {items.map((item) => (
        <Link key={`${item.id}-detail`} href={`/student/recommendations/${item.id}`} asChild>
          <Button label={`Ver ${item.name}`} variant="secondary" onPress={() => undefined} />
        </Link>
      ))}
    </Screen>
  );
}
