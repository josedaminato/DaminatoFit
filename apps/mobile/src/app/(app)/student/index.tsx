import { useEffect, useState } from 'react';
import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useBrand } from '@/brand/BrandProvider';
import { listStudentRoutines } from '@/features/routines/routine-api';
import type { StudentRoutineListItem } from '@/features/routines/types';
import { useSession } from '@/lib/session';
import { Screen } from '@/ui/Screen';
import { Button } from '@/ui/Button';
import { ErrorText } from '@/ui/ErrorText';

export default function StudentHomeScreen() {
  const { colors } = useBrand();
  const { me, activeMembership, apiContext } = useSession();

  const [routines, setRoutines] = useState<StudentRoutineListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await listStudentRoutines(apiContext);
        if (cancelled) return;
        setRoutines(rows);
        setError(null);
      } catch {
        if (cancelled) return;
        setError('No se pudieron cargar tus rutinas.');
        setRoutines([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiContext]);

  const primary = routines[0] ?? null;

  return (
    <Screen title="Mi entrenamiento">
      <Text style={{ color: colors.textMuted, fontSize: 16 }}>
        Hola, {me?.user.displayName}. Entrenás con {activeMembership?.tenantName ?? 'tu entrenador'}
        .
      </Text>

      {loading ? (
        <Text style={{ color: colors.textMuted }}>Cargando tu rutina…</Text>
      ) : error ? (
        <ErrorText message={error} />
      ) : primary ? (
        <View style={[styles.routineBox, { borderColor: colors.border }]}>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 18 }}>
            {primary.name}
          </Text>
          {primary.description ? (
            <Text style={{ color: colors.textMuted }}>{primary.description}</Text>
          ) : null}
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>
            Versión {primary.versionNumber ?? '—'}
            {primary.startsOn ? ` · desde ${primary.startsOn}` : ''}
            {primary.endsOn ? ` · hasta ${primary.endsOn}` : ''}
          </Text>
          <Link href={`/student/routines/${primary.id}`} asChild>
            <Button label="Ver rutina completa" onPress={() => undefined} />
          </Link>
        </View>
      ) : (
        <Text style={{ color: colors.textMuted, fontSize: 15 }}>
          Tu entrenador todavía no te asignó una rutina activa.
        </Text>
      )}

      <View style={styles.actions}>
        <Link href="/student/contact" asChild>
          <Button label="Contactar entrenador" onPress={() => undefined} />
        </Link>
        <Link href="/student/select-trainer" asChild>
          <Button label="Cambiar espacio" variant="secondary" onPress={() => undefined} />
        </Link>
        <Link href="/settings" asChild>
          <Button label="Ajustes" variant="secondary" onPress={() => undefined} />
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  routineBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 14,
    gap: 8,
  },
  actions: { gap: 12, marginTop: 8 },
});
