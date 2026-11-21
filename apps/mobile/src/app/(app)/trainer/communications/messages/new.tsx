import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { sendMessage } from '@/features/communications/api';
import {
  MessageComposer,
  type MessageStudentOption,
} from '@/features/communications/TrainerComposer';
import { fetchJson } from '@/lib/api-client';
import { useSession } from '@/lib/session';
import { Screen } from '@/ui/Screen';
import { ErrorText } from '@/ui/ErrorText';

interface StudentRow {
  membership_id: string;
  display_name: string;
  status: string;
}

export default function NewMessageScreen() {
  const { apiContext } = useSession();
  const [students, setStudents] = useState<MessageStudentOption[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchJson<{ students: StudentRow[] }>(apiContext, '/v1/trainer/students')
      .then((res) => {
        if (cancelled) return;
        setStudents(
          res.students
            .filter((student) => student.status === 'active')
            .map((student) => ({ id: student.membership_id, name: student.display_name })),
        );
      })
      .catch(() => {
        if (!cancelled) setError('No se pudieron cargar los alumnos.');
      });
    return () => {
      cancelled = true;
    };
  }, [apiContext]);

  return (
    <Screen title="Mensaje individual">
      {students.length === 0 ? (
        <ErrorText message={error ?? 'No hay alumnos activos en este espacio.'} />
      ) : (
        <MessageComposer
          students={students}
          sending={sending}
          onSend={(input) => {
            setSending(true);
            setError(null);
            void sendMessage(apiContext, input)
              .then(() => router.replace('/trainer/communications/messages'))
              .catch(() => setError('No se pudo enviar el mensaje.'))
              .finally(() => setSending(false));
          }}
        />
      )}
      {students.length > 0 ? <ErrorText message={error} /> : null}
    </Screen>
  );
}
