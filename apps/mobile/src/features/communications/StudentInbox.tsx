import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useBrand } from '@/brand/BrandProvider';
import type { AnnouncementItem, DirectMessageItem, UnreadCounts } from './api';

interface StudentInboxProps {
  tenantName: string;
  announcements: AnnouncementItem[];
  messages: DirectMessageItem[];
  unread: UnreadCounts;
  whatsappUrl: string | null;
  pushStatus: 'idle' | 'denied' | 'granted' | 'unavailable';
  onOpenAnnouncement: (id: string) => void;
  onOpenMessage: (id: string) => void;
  onOpenWhatsapp: () => void;
  onRequestPush: () => void;
}

function formatWhen(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' });
}

export function StudentInbox({
  tenantName,
  announcements,
  messages,
  unread,
  whatsappUrl,
  pushStatus,
  onOpenAnnouncement,
  onOpenMessage,
  onOpenWhatsapp,
  onRequestPush,
}: StudentInboxProps) {
  const { colors, layout, fontFamily } = useBrand();
  const card = {
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: layout?.radiusMd ?? 10,
    borderWidth: layout?.cardBorderWidth ?? StyleSheet.hairlineWidth,
  };

  return (
    <View style={{ gap: layout?.sectionGap ?? 16 }} testID="student-inbox">
      <Text
        style={{ color: colors.textMuted, fontFamily: fontFamily?.regular }}
        testID="inbox-tenant"
      >
        Espacio de {tenantName}
      </Text>
      <Text
        testID="unread-total"
        style={{ color: colors.primary, fontFamily: fontFamily?.bold, fontWeight: '700' }}
      >
        {unread.total} sin leer
      </Text>

      <Text style={[styles.section, { color: colors.text, fontFamily: fontFamily?.bold }]}>
        Avisos
      </Text>
      {announcements.length === 0 ? (
        <Text style={{ color: colors.textMuted }}>No hay avisos vigentes.</Text>
      ) : (
        announcements.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            testID="communication-card"
            onPress={() => onOpenAnnouncement(item.id)}
            style={card}
          >
            <Text style={{ color: colors.text, fontFamily: fontFamily?.bold, fontWeight: '700' }}>
              {item.title}
              {item.readAt ? '' : ' · nuevo'}
            </Text>
            <Text style={{ color: colors.textMuted }}>
              {item.authorName} · {formatWhen(item.publishedAt)}
            </Text>
          </Pressable>
        ))
      )}

      <Text style={[styles.section, { color: colors.text, fontFamily: fontFamily?.bold }]}>
        Mensajes
      </Text>
      {messages.length === 0 ? (
        <Text style={{ color: colors.textMuted }}>No tenés mensajes personales.</Text>
      ) : (
        messages.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            testID="message-card"
            onPress={() => onOpenMessage(item.id)}
            style={card}
          >
            <Text style={{ color: colors.text }} numberOfLines={2}>
              {item.body}
              {item.readAt ? '' : ' · nuevo'}
            </Text>
            <Text style={{ color: colors.textMuted }}>
              {item.senderName} · {formatWhen(item.createdAt)}
            </Text>
          </Pressable>
        ))
      )}

      {whatsappUrl ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Contactar a mi entrenador"
          testID="whatsapp-button"
          onPress={onOpenWhatsapp}
          style={[
            styles.contact,
            { backgroundColor: colors.primary, borderRadius: layout?.radiusMd ?? 10 },
          ]}
        >
          <Text
            style={{ color: colors.onPrimary, fontFamily: fontFamily?.bold, fontWeight: '700' }}
          >
            Contactar a mi entrenador
          </Text>
        </Pressable>
      ) : (
        <Text testID="whatsapp-missing" style={{ color: colors.textMuted }}>
          Tu entrenador todavía no cargó un WhatsApp.
        </Text>
      )}

      {pushStatus === 'denied' ? (
        <Text testID="push-denied" style={{ color: colors.textMuted }}>
          Podés seguir usando la app sin notificaciones del sistema. Los avisos quedan en esta
          pantalla.
        </Text>
      ) : null}
      {pushStatus === 'unavailable' ? (
        <Text testID="push-unavailable" style={{ color: colors.textMuted }}>
          Los avisos dentro de la app funcionan. Las notificaciones del sistema todavía no están
          habilitadas en este dispositivo.
        </Text>
      ) : null}
      {pushStatus === 'idle' ? (
        <Pressable accessibilityRole="button" testID="push-request" onPress={onRequestPush}>
          <Text style={{ color: colors.primary, fontFamily: fontFamily?.bold }}>
            Activar notificaciones
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 18, fontWeight: '700', marginTop: 8 },
  contact: { minHeight: 48, alignItems: 'center', justifyContent: 'center', padding: 14 },
});
