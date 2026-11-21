import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useBrand } from '@/brand/BrandProvider';
import { listAnnouncements, listMessages } from '@/features/communications/api';
import { useSession } from '@/lib/session';
import { Screen } from '@/ui/Screen';
import { Button } from '@/ui/Button';
import { ErrorText } from '@/ui/ErrorText';

export default function TrainerCommunicationsScreen() {
  const { colors, layout, fontFamily } = useBrand();
  const { apiContext } = useSession();
  const [noticeCount, setNoticeCount] = useState(0);
  const [messageCount, setMessageCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [notices, messages] = await Promise.all([
        listAnnouncements(apiContext),
        listMessages(apiContext),
      ]);
      setNoticeCount(notices.announcements.length);
      setMessageCount(messages.messages.length);
      setError(null);
    } catch {
      setError('No se pudo cargar el centro de comunicaciones.');
    }
  }, [apiContext]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <Screen title="Comunicaciones">
      <Text style={{ color: colors.textMuted, fontFamily: fontFamily?.regular }}>
        Los avisos llegan a tus alumnos activos. Los mensajes son individuales y no tienen respuesta
        dentro de la app.
      </Text>
      <View style={styles.actions}>
        <Link href="/trainer/communications/announcements/new" asChild>
          <Button label="Nuevo aviso" onPress={() => undefined} />
        </Link>
        <Link href="/trainer/communications/messages/new" asChild>
          <Button label="Mensaje a un alumno" onPress={() => undefined} />
        </Link>
      </View>
      <Link href="/trainer/communications/announcements" asChild>
        <Pressable
          style={[
            styles.row,
            {
              borderColor: colors.border,
              backgroundColor: colors.surface,
              borderRadius: layout?.radiusMd ?? 10,
            },
          ]}
        >
          <Text style={{ color: colors.text, fontWeight: '700' }}>Avisos ({noticeCount})</Text>
        </Pressable>
      </Link>
      <Link href="/trainer/communications/messages" asChild>
        <Pressable
          style={[
            styles.row,
            {
              borderColor: colors.border,
              backgroundColor: colors.surface,
              borderRadius: layout?.radiusMd ?? 10,
            },
          ]}
        >
          <Text style={{ color: colors.text, fontWeight: '700' }}>
            Mensajes enviados ({messageCount})
          </Text>
        </Pressable>
      </Link>
      <ErrorText message={error} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { gap: 12 },
  row: { borderWidth: 1, padding: 16 },
});
