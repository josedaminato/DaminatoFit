import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useBrand } from '@/brand/BrandProvider';
import { assignRoutine, getRoutine } from '@/features/routines/routine-api';
import { fetchJson } from '@/lib/api-client';
import { useSession } from '@/lib/session';
import { Screen } from '@/ui/Screen';
import { Field } from '@/ui/Field';
import { Button } from '@/ui/Button';
import { ErrorText } from '@/ui/ErrorText';

interface StudentRow {
  membership_id: string;
  display_name: string;
  status: string;
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

export default function AssignRoutineScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const routineId = typeof id === 'string' ? id : '';
  const { colors } = useBrand();
  const { apiContext } = useSession();
  const router = useRouter();

  const [templateName, setTemplateName] = useState('');
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [replaceActive, setReplaceActive] = useState(true);
  const [loading, setLoading] = useState(Boolean(routineId));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeStudents = useMemo(
    () => students.filter((s) => s.status === 'active' || s.status === 'activated'),
    [students],
  );

  const load = useCallback(async () => {
    if (!routineId) return;
    setError(null);
    try {
      const [routine, studentsRes] = await Promise.all([
        getRoutine(apiContext, routineId),
        fetchJson<{ students: StudentRow[] }>(apiContext, '/v1/trainer/students'),
      ]);
      if (routine.kind !== 'template') {
        setError('Solo podés asignar plantillas publicadas.');
      }
      setTemplateName(routine.name);
      setStudents(studentsRes.students);
    } catch {
      setError('No se pudo cargar datos para asignar.');
    } finally {
      setLoading(false);
    }
  }, [apiContext, routineId]);

  useEffect(() => {
    if (!routineId) return;
    let cancelled = false;
    void (async () => {
      await load();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [load, routineId]);

  const toggleStudent = (membershipId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(membershipId)) next.delete(membershipId);
      else next.add(membershipId);
      return next;
    });
  };

  const onAssign = async () => {
    if (!routineId) return;
    if (selected.size === 0) {
      setError('Seleccioná al menos un alumno.');
      return;
    }
    if (startsOn && !isIsoDate(startsOn)) {
      setError('Fecha de inicio inválida (AAAA-MM-DD).');
      return;
    }
    if (endsOn && !isIsoDate(endsOn)) {
      setError('Fecha de fin inválida (AAAA-MM-DD).');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await assignRoutine(apiContext, routineId, {
        studentMembershipIds: [...selected],
        startsOn: startsOn.trim() || undefined,
        endsOn: endsOn.trim() || null,
        replaceActive,
      });
      router.replace(`/trainer/routines/${routineId}`);
    } catch {
      setError(
        'No se pudo asignar. Verificá que la plantilla esté publicada y que los alumnos estén activos.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!routineId) {
    return (
      <Screen title="Asignar rutina">
        <Text style={{ color: colors.textMuted }}>Falta el identificador de la rutina.</Text>
      </Screen>
    );
  }

  return (
    <Screen title="Asignar rutina">
      {loading ? (
        <Text style={{ color: colors.textMuted }}>Cargando…</Text>
      ) : (
        <View style={styles.stack}>
          <Text style={{ color: colors.textMuted }}>
            Plantilla: <Text style={{ color: colors.text, fontWeight: '600' }}>{templateName}</Text>
          </Text>

          <Field
            label="Inicio (opcional, AAAA-MM-DD)"
            placeholder="2026-01-06"
            autoCapitalize="none"
            value={startsOn}
            onChangeText={setStartsOn}
          />
          <Field
            label="Fin (opcional)"
            placeholder="2026-03-01"
            autoCapitalize="none"
            value={endsOn}
            onChangeText={setEndsOn}
          />

          <Pressable
            onPress={() => setReplaceActive((v) => !v)}
            style={[styles.toggleRow, { borderColor: colors.border }]}
          >
            <Text style={{ color: colors.text, flex: 1 }}>Reemplazar rutina activa del alumno</Text>
            <Text style={{ color: colors.primary, fontWeight: '700' }}>
              {replaceActive ? 'Sí' : 'No'}
            </Text>
          </Pressable>

          <Text style={[styles.heading, { color: colors.text }]}>Alumnos</Text>
          <FlatList
            data={activeStudents}
            keyExtractor={(item) => item.membership_id}
            style={styles.list}
            ListEmptyComponent={
              <Text style={{ color: colors.textMuted }}>No hay alumnos activos.</Text>
            }
            renderItem={({ item }) => {
              const on = selected.has(item.membership_id);
              return (
                <Pressable
                  onPress={() => toggleStudent(item.membership_id)}
                  style={[
                    styles.studentRow,
                    {
                      borderColor: colors.border,
                      backgroundColor: on ? colors.primary : colors.surface,
                    },
                  ]}
                >
                  <Text style={{ color: on ? colors.onPrimary : colors.text, fontWeight: '600' }}>
                    {item.display_name}
                  </Text>
                  <Text style={{ color: on ? colors.onPrimary : colors.textMuted }}>
                    {on ? 'Seleccionado' : 'Tocar para elegir'}
                  </Text>
                </Pressable>
              );
            }}
          />

          <Button
            label="Confirmar asignación"
            onPress={() => void onAssign()}
            loading={submitting}
          />
          <Link href={`/trainer/routines/${routineId}`} asChild>
            <Button label="Volver al editor" variant="secondary" onPress={() => undefined} />
          </Link>
          <ErrorText message={error} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12, flex: 1 },
  heading: { fontSize: 17, fontWeight: '600' },
  toggleRow: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  list: { maxHeight: 320 },
  studentRow: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    gap: 4,
  },
});
