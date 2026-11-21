import { router } from 'expo-router';
import { useState } from 'react';
import { createAnnouncement, publishAnnouncement } from '@/features/communications/api';
import { AnnouncementForm } from '@/features/communications/TrainerComposer';
import { useSession } from '@/lib/session';
import { Screen } from '@/ui/Screen';
import { ErrorText } from '@/ui/ErrorText';

export default function NewAnnouncementScreen() {
  const { apiContext } = useSession();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(input: { title: string; body: string }, publish: boolean) {
    setSaving(true);
    setError(null);
    try {
      const created = await createAnnouncement(apiContext, input);
      if (publish) await publishAnnouncement(apiContext, created.id);
      router.replace('/trainer/communications/announcements');
    } catch {
      setError('No se pudo guardar el aviso.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen title="Nuevo aviso">
      <AnnouncementForm
        saving={saving}
        onSaveDraft={(input) => void save(input, false)}
        onPublish={(input) => void save(input, true)}
      />
      <ErrorText message={error} />
    </Screen>
  );
}
