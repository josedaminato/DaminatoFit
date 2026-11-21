import { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useBrand } from '@/brand/BrandProvider';
import { fetchJson } from '@/lib/api-client';
import { useSession } from '@/lib/session';
import { isValidEmail } from '@/lib/validation';
import { Screen } from '@/ui/Screen';
import { Field } from '@/ui/Field';
import { Button } from '@/ui/Button';
import { ErrorText } from '@/ui/ErrorText';

interface StudentRow {
  membership_id: string;
  user_id: string;
  display_name: string;
  status: string;
  activated_at: string | null;
}

interface InvitationRow {
  id: string;
  email: string;
  status: string;
  expiresAt: string;
}

export default function TrainerStudentsScreen() {
  const { colors } = useBrand();
  const { apiContext } = useSession();
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [studentsRes, invitesRes] = await Promise.all([
      fetchJson<{ students: StudentRow[] }>(apiContext, '/v1/trainer/students'),
      fetchJson<{ invitations: InvitationRow[] }>(apiContext, '/v1/invitations'),
    ]);
    setStudents(studentsRes.students);
    setInvitations(invitesRes.invitations);
  }, [apiContext]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await refresh();
      } catch {
        if (!cancelled) setError('No se pudo cargar la lista.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const invite = async () => {
    if (!isValidEmail(inviteEmail)) {
      setError('Email inválido.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await fetchJson(apiContext, '/v1/invitations', {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail.trim().toLowerCase() }),
      });
      setInviteEmail('');
      await refresh();
    } catch {
      setError('No se pudo crear la invitación.');
    } finally {
      setLoading(false);
    }
  };

  const revoke = async (id: string) => {
    try {
      await fetchJson(apiContext, `/v1/invitations/${id}/revoke`, { method: 'POST' });
      await refresh();
    } catch {
      setError('No se pudo revocar la invitación.');
    }
  };

  return (
    <Screen title="Alumnos" scroll={false}>
      <View style={styles.form}>
        <Field
          label="Invitar alumno por email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={inviteEmail}
          onChangeText={setInviteEmail}
        />
        <Button label="Enviar invitación" onPress={invite} loading={loading} />
        <ErrorText message={error} />
      </View>

      <Text style={[styles.heading, { color: colors.text }]}>Alumnos activos</Text>
      <FlatList
        data={students}
        keyExtractor={(item) => item.membership_id}
        ListEmptyComponent={
          <Text style={{ color: colors.textMuted }}>Todavía no hay alumnos.</Text>
        }
        renderItem={({ item }) => (
          <View style={[styles.row, { borderColor: colors.border }]}>
            <Text style={{ color: colors.text, fontWeight: '600' }}>{item.display_name}</Text>
            <Text style={{ color: colors.textMuted }}>{item.status}</Text>
          </View>
        )}
      />

      <Text style={[styles.heading, { color: colors.text }]}>Invitaciones</Text>
      <FlatList
        data={invitations}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <Text style={{ color: colors.textMuted }}>Sin invitaciones pendientes.</Text>
        }
        renderItem={({ item }) => (
          <View style={[styles.row, { borderColor: colors.border }]}>
            <View>
              <Text style={{ color: colors.text }}>{item.email}</Text>
              <Text style={{ color: colors.textMuted }}>{item.status}</Text>
            </View>
            {item.status === 'pending' ? (
              <Button label="Revocar" variant="danger" onPress={() => void revoke(item.id)} />
            ) : null}
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 12, paddingBottom: 8 },
  heading: { fontSize: 18, fontWeight: '600', marginTop: 12, marginBottom: 8 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
});
