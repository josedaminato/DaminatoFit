import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { useBrand } from '@/brand/BrandProvider';
import { getMessage, markMessageRead, type DirectMessageItem } from '@/features/communications/api';
import { useSession } from '@/lib/session';
import { Screen } from '@/ui/Screen';
import { Button } from '@/ui/Button';
import { ErrorText } from '@/ui/ErrorText';

export default function MessageDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, fontFamily } = useBrand();
  const { apiContext } = useSession();
  const [item, setItem] = useState<DirectMessageItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getMessage(apiContext, id)
      .then((res) => {
        if (!cancelled) setItem(res.message);
      })
      .catch(() => {
        if (!cancelled) setError('Este mensaje no está disponible en el espacio activo.');
      });
    return () => {
      cancelled = true;
    };
  }, [apiContext, id]);

  return (
    <Screen title="Mensaje">
      {item ? (
        <>
          <Text style={{ color: colors.textMuted, fontFamily: fontFamily?.regular }}>
            {item.senderName}
            {item.createdAt ? ` · ${new Date(item.createdAt).toLocaleString('es-AR')}` : ''}
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
                void markMessageRead(apiContext, id)
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
