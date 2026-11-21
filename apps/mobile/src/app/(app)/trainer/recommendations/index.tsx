import { useCallback, useState } from 'react';
import { Link, useFocusEffect } from 'expo-router';
import { Text, View } from 'react-native';
import { useBrand } from '@/brand/BrandProvider';
import {
  listOwnRecommendations,
  reorderRecommendations,
  type RecommendationItem,
} from '@/features/recommendations/api';
import { RecommendationCard } from '@/features/recommendations/views';
import { useSession } from '@/lib/session';
import { Button } from '@/ui/Button';
import { ErrorText } from '@/ui/ErrorText';
import { Screen } from '@/ui/Screen';

export default function TrainerRecommendationsScreen() {
  const { colors } = useBrand();
  const { apiContext } = useSession();
  const [items, setItems] = useState<RecommendationItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    void listOwnRecommendations(apiContext)
      .then((data) => {
        if (!cancelled) setItems(data.items.filter((item) => item.status !== 'archived'));
      })
      .catch(() => {
        if (!cancelled) setError('No se pudieron cargar las recomendaciones.');
      });
    return () => {
      cancelled = true;
    };
  }, [apiContext]);

  useFocusEffect(load);

  async function move(index: number, direction: -1 | 1) {
    const next = [...items];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    const current = next[index];
    const other = next[target];
    if (!current || !other) return;
    next[index] = other;
    next[target] = current;
    setItems(next);
    try {
      await reorderRecommendations(
        apiContext,
        next.map((item) => item.id),
      );
    } catch {
      setError('No se pudo reordenar.');
      load();
    }
  }

  return (
    <Screen title="Mis recomendaciones">
      <Text style={{ color: colors.textMuted }}>
        Podés recomendar un negocio o profesional con o sin acuerdo comercial. DaminatoFit no
        negocia ni cobra comisión.
      </Text>
      {error ? <ErrorText message={error} /> : null}
      <Link href="/trainer/recommendations/new" asChild>
        <Button label="Agregar recomendación" onPress={() => undefined} />
      </Link>
      {items.map((item, index) => (
        <View key={item.id} style={{ gap: 8 }}>
          <RecommendationCard item={item} />
          <Text style={{ color: colors.textMuted }}>
            {item.status}
            {item.moderationHidden ? ' · oculta por moderación' : ''}
          </Text>
          <Link href={`/trainer/recommendations/${item.id}`} asChild>
            <Button label={`Editar ${item.name}`} variant="secondary" onPress={() => undefined} />
          </Link>
          <Button label="Subir" variant="secondary" onPress={() => void move(index, -1)} />
          <Button label="Bajar" variant="secondary" onPress={() => void move(index, 1)} />
        </View>
      ))}
    </Screen>
  );
}
