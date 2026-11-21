import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { useBrand } from '@/brand/BrandProvider';
import {
  getAnnouncement,
  markAnnouncementRead,
  type AnnouncementItem,
} from '@/features/communications/api';
import { useSession } from '@/lib/session';
import { Screen } from '@/ui/Screen';
import { Button } from '@/ui/Button';
import { ErrorText } from '@/ui/ErrorText';

export default function AnnouncementDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, fontFamily } = useBrand();
  const { apiContext } = useSession();
  const [item, setItem] = useState<AnnouncementItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getAnnouncement(apiContext, id)
      .then((res) => {
        if (!cancelled) setItem(res.announcement);
      })
      .catch(() => {
        if (!cancelled) setError('Este aviso no está disponible en el espacio activo.');
      });
    return () => {
      cancelled = true;
    };
  }, [apiContext, id]);

  return (
    <Screen title={item?.title ?? 'Aviso'}>
      {item ? (
        <>
          <Text style={{ color: colors.textMuted, fontFamily: fontFamily?.regular }}>
            {item.authorName}
            {item.publishedAt ? ` · ${new Date(item.publishedAt).toLocaleString('es-AR')}` : ''}
          </Text>
          <Text style={{ color: colors.text, fontSize: 16, lineHeight: 24 }}>{item.body}</Text>
          {item.readAt ? (
            <Text style={{ color: colors.textMuted }}>Leído</Text>
          ) : (
            <Button
              label="Marcar como leído"
              loading={saving}
              onPress={() => {
                if (!id) return;
                setSaving(true);
                void markAnnouncementRead(apiContext, id)
                  .then((res) => setItem({ ...item, readAt: res.readAt }))
                  .catch(() => setError('No se pudo marcar como leído.'))
                  .finally(() => setSaving(false));
              }}
            />
          )}
        </>
      ) : null}
      <ErrorText message={error} />
    </Screen>
  );
}
