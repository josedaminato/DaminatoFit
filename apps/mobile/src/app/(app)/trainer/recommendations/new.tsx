import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { createRecommendation, listCategories } from '@/features/recommendations/api';
import { RecommendationEditor } from '@/features/recommendations/editor';
import { useSession } from '@/lib/session';
import { Screen } from '@/ui/Screen';

export default function NewRecommendationScreen() {
  const router = useRouter();
  const { apiContext } = useSession();
  const [categories, setCategories] = useState<{ slug: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void listCategories(apiContext)
      .then((data) => setCategories(data.items))
      .catch(() => setError('No se pudieron cargar las categorías.'));
  }, [apiContext]);

  return (
    <Screen title="Nueva recomendación">
      <RecommendationEditor
        categories={categories}
        saving={saving}
        error={error}
        onSubmit={(input) => {
          setSaving(true);
          void createRecommendation(apiContext, input)
            .then((created) => router.replace(`/trainer/recommendations/${created.id}`))
            .catch(() => setError('No se pudo guardar. Revisá el enlace y los datos.'))
            .finally(() => setSaving(false));
        }}
      />
    </Screen>
  );
}
