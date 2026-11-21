import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Platform, Text } from 'react-native';
import { useBrand } from '@/brand/BrandProvider';
import {
  getUnread,
  listAnnouncements,
  listMessages,
  registerPushToken,
  type AnnouncementItem,
  type DirectMessageItem,
  type UnreadCounts,
} from '@/features/communications/api';
import { enablePushFromUserAction, type PushClient } from '@/features/communications/push';
import { StudentInbox } from '@/features/communications/StudentInbox';
import { openWhatsapp, whatsappUrl } from '@/features/communications/whatsapp';
import { fetchJson } from '@/lib/api-client';
import { useSession } from '@/lib/session';
import type { TrainerProfile } from '@/lib/me-types';
import { Screen } from '@/ui/Screen';
import { ErrorText } from '@/ui/ErrorText';

const emptyUnread: UnreadCounts = { announcements: 0, messages: 0, total: 0 };

async function devicePushClient(): Promise<PushClient> {
  const Notifications = await import('expo-notifications');
  const map = (status: string) =>
    status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
  return {
    async getPermission() {
      const current = await Notifications.getPermissionsAsync();
      return map(current.status);
    },
    async requestPermission() {
      const next = await Notifications.requestPermissionsAsync();
      return map(next.status);
    },
    async getToken() {
      const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
      if (!projectId) return null;
      const token = await Notifications.getExpoPushTokenAsync({ projectId });
      return token.data || null;
    },
  };
}

export default function StudentCommunicationsScreen() {
  const { colors } = useBrand();
  const { apiContext, activeMembership } = useSession();
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [messages, setMessages] = useState<DirectMessageItem[]>([]);
  const [unread, setUnread] = useState<UnreadCounts>(emptyUnread);
  const [contactUrl, setContactUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pushStatus, setPushStatus] = useState<'idle' | 'denied' | 'granted' | 'unavailable'>(
    'idle',
  );
  const [whatsappNote, setWhatsappNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [notices, inbox, counts, profile] = await Promise.all([
        listAnnouncements(apiContext),
        listMessages(apiContext),
        getUnread(apiContext),
        fetchJson<{ profile: TrainerProfile }>(apiContext, '/v1/me/trainer-profile'),
      ]);
      setAnnouncements(notices.announcements);
      setMessages(inbox.messages);
      setUnread(counts);
      setContactUrl(profile.profile.whatsappUrl ?? whatsappUrl(profile.profile.whatsappE164));
      setError(null);
    } catch {
      setError('No se pudieron cargar las comunicaciones de este espacio.');
    }
  }, [apiContext]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load();
    });
    return () => sub.remove();
  }, [load]);

  return (
    <Screen title="Avisos y mensajes">
      <StudentInbox
        tenantName={activeMembership?.tenantName ?? 'tu entrenador'}
        announcements={announcements}
        messages={messages}
        unread={unread}
        whatsappUrl={contactUrl}
        pushStatus={pushStatus}
        onOpenAnnouncement={(id) => router.push(`/student/communications/announcements/${id}`)}
        onOpenMessage={(id) => router.push(`/student/communications/messages/${id}`)}
        onOpenWhatsapp={() => {
          void openWhatsapp(contactUrl).then((result) => {
            if (result === 'unavailable') {
              setWhatsappNote(
                'No se pudo abrir WhatsApp. El enlace sigue disponible en el perfil.',
              );
            }
          });
        }}
        onRequestPush={() => {
          void (async () => {
            try {
              const client = await devicePushClient();
              const result = await enablePushFromUserAction(client);
              if (result === 'granted') {
                const token = await client.getToken();
                if (token) {
                  await registerPushToken(apiContext, {
                    token,
                    platform: Platform.OS === 'ios' ? 'ios' : 'android',
                    label: Platform.OS,
                  });
                }
                setPushStatus(token ? 'granted' : 'unavailable');
              } else {
                setPushStatus(result);
              }
            } catch {
              setPushStatus('unavailable');
            }
          })();
        }}
      />
      {whatsappNote ? <Text style={{ color: colors.textMuted }}>{whatsappNote}</Text> : null}
      <ErrorText message={error} />
    </Screen>
  );
}
