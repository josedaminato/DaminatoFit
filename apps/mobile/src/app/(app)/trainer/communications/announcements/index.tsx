import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { useBrand } from '@/brand/BrandProvider';
import { listAnnouncements, type AnnouncementItem } from '@/features/communications/api';
import { useSession } from '@/lib/session';
import { Screen } from '@/ui/Screen';
import { Button } from '@/ui/Button';
import { ErrorText } from '@/ui/ErrorText';

const STATUS_LABEL = { draft: 'Borrador', published: 'Publicado', archived: 'Archivado' };

export default function TrainerAnnouncementsScreen() {
  const { colors, layout } = useBrand();
  const { apiContext } = useSession();
  const [items, setItems] = useState<AnnouncementItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await listAnnouncements(apiContext);
      setItems(res.announcements);
      setError(null);
    } catch {
      setError('No se pudieron cargar los avisos.');
    }
  }, [apiContext]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <Screen title="Avisos">
      <Link href="/trainer/communications/announcements/new" asChild>
        <Button label="Nuevo aviso" onPress={() => undefined} />
      </Link>
      {items.map((item) => (
        <Link key={item.id} href={`/trainer/communications/announcements/${item.id}`} asChild>
          <Pressable
            style={{
              borderColor: colors.border,
              backgroundColor: colors.surface,
              borderRadius: layout?.radiusMd ?? 10,
              borderWidth: 1,
              padding: 14,
              gap: 4,
            }}
          >
            <Text style={{ color: colors.text, fontWeight: '700' }}>{item.title}</Text>
            <Text style={{ color: colors.textMuted }}>
              {STATUS_LABEL[item.status]}
              {item.publishedAt ? ` · ${new Date(item.publishedAt).toLocaleString('es-AR')}` : ''}
              {' · '}
              {item.authorName}
            </Text>
          </Pressable>
        </Link>
      ))}
      <ErrorText message={error} />
    </Screen>
  );
}
