import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  archiveAnnouncement,
  getAnnouncement,
  publishAnnouncement,
  updateAnnouncement,
  type AnnouncementItem,
} from '@/features/communications/api';
import { AnnouncementForm } from '@/features/communications/TrainerComposer';
import { useSession } from '@/lib/session';
import { Screen } from '@/ui/Screen';
import { Button } from '@/ui/Button';
import { ErrorText } from '@/ui/ErrorText';

export default function EditAnnouncementScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { apiContext } = useSession();
  const [item, setItem] = useState<AnnouncementItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getAnnouncement(apiContext, id)
      .then((res) => {
        if (!cancelled) setItem(res.announcement);
      })
      .catch(() => {
        if (!cancelled) setError('No se encontró el aviso.');
      });
    return () => {
      cancelled = true;
    };
  }, [apiContext, id]);

  async function save(input: { title: string; body: string }, publish: boolean) {
    if (!id || !item || item.status !== 'draft') return;
    setSaving(true);
    setError(null);
    try {
      await updateAnnouncement(apiContext, id, input);
      if (publish) await publishAnnouncement(apiContext, id);
      router.replace('/trainer/communications/announcements');
    } catch {
      setError('No se pudo guardar el aviso.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen title="Aviso">
      {item ? (
        <>
          <AnnouncementForm
            initialTitle={item.title}
            initialBody={item.body}
            locked={item.status !== 'draft'}
            saving={saving}
            onSaveDraft={(input) => void save(input, false)}
            onPublish={(input) => void save(input, true)}
          />
          {item.status !== 'archived' ? (
            <Button
              label="Archivar"
              variant="secondary"
              onPress={() => {
                if (!id) return;
                setSaving(true);
                void archiveAnnouncement(apiContext, id)
                  .then(() => router.replace('/trainer/communications/announcements'))
                  .catch(() => setError('No se pudo archivar.'))
                  .finally(() => setSaving(false));
              }}
            />
          ) : null}
        </>
      ) : null}
      <ErrorText message={error} />
    </Screen>
  );
}
