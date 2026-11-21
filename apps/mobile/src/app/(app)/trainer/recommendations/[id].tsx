import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';
import { useBrand } from '@/brand/BrandProvider';
import {
  getRecommendation,
  listCategories,
  recommendationAction,
  updateRecommendation,
  type RecommendationItem,
} from '@/features/recommendations/api';
import { RecommendationEditor } from '@/features/recommendations/editor';
import { useSession } from '@/lib/session';
import { Button } from '@/ui/Button';
import { Screen } from '@/ui/Screen';

export default function EditRecommendationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useBrand();
  const { apiContext } = useSession();
  const [item, setItem] = useState<RecommendationItem | null>(null);
  const [categories, setCategories] = useState<{ slug: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    void Promise.all([getRecommendation(apiContext, id), listCategories(apiContext)])
      .then(([recommendation, cats]) => {
        setItem(recommendation);
        setCategories(cats.items);
      })
      .catch(() => setError('No se encontró la recomendación.'));
  }, [apiContext, id]);

  async function act(action: 'publish' | 'hide' | 'archive') {
    if (!id) return;
    try {
      await recommendationAction(apiContext, id, action);
      const fresh = await getRecommendation(apiContext, id);
      setItem(fresh);
      setError(null);
    } catch {
      setError('No se pudo cambiar el estado.');
    }
  }

  return (
    <Screen title="Editar recomendación">
      {item?.moderationHidden ? (
        <Text style={{ color: colors.danger }}>
          Esta recomendación está oculta por moderación y no se puede volver a publicar.
        </Text>
      ) : null}
      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
      {item ? (
        <RecommendationEditor
          categories={categories}
          saving={saving}
          initial={item}
          onSubmit={(input) => {
            setSaving(true);
            void updateRecommendation(apiContext, item.id, input)
              .then(() => getRecommendation(apiContext, item.id))
              .then(setItem)
              .catch(() => setError('No se pudo guardar.'))
              .finally(() => setSaving(false));
          }}
        />
      ) : null}
      <Button label="Publicar" onPress={() => void act('publish')} />
      <Button label="Ocultar" variant="secondary" onPress={() => void act('hide')} />
      <Button label="Archivar" variant="secondary" onPress={() => void act('archive')} />
    </Screen>
  );
}
