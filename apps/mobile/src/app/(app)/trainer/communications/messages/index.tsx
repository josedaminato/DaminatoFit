import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useBrand } from '@/brand/BrandProvider';
import { listMessages, type DirectMessageItem } from '@/features/communications/api';
import { useSession } from '@/lib/session';
import { Screen } from '@/ui/Screen';
import { ErrorText } from '@/ui/ErrorText';

export default function SentMessagesScreen() {
  const { colors, layout } = useBrand();
  const { apiContext } = useSession();
  const [items, setItems] = useState<DirectMessageItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await listMessages(apiContext);
      setItems(res.messages);
      setError(null);
    } catch {
      setError('No se pudieron cargar los mensajes enviados.');
    }
  }, [apiContext]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <Screen title="Mensajes enviados">
      {items.length === 0 ? (
        <Text style={{ color: colors.textMuted }}>Todavía no enviaste mensajes.</Text>
      ) : null}
      {items.map((item) => (
        <View
          key={item.id}
          style={{
            borderColor: colors.border,
            backgroundColor: colors.surface,
            borderRadius: layout?.radiusMd ?? 10,
            borderWidth: 1,
            padding: 14,
            gap: 4,
          }}
        >
          <Text style={{ color: colors.text, fontWeight: '700' }}>Para {item.recipientName}</Text>
          <Text style={{ color: colors.text }}>{item.body}</Text>
          <Text style={{ color: colors.textMuted }}>
            {item.createdAt ? new Date(item.createdAt).toLocaleString('es-AR') : ''}
            {item.readAt ? ' · leído' : ' · sin leer'}
          </Text>
        </View>
      ))}
      <ErrorText message={error} />
    </Screen>
  );
}
