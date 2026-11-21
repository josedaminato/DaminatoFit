import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useBrand } from '@/brand/BrandProvider';
import { createRoutine, listRoutines } from '@/features/routines/routine-api';
import {
  routineKindLabel,
  routineStatusLabel,
  type RoutineKind,
  type RoutineListItem,
  type RoutineStatus,
} from '@/features/routines/types';
import { useSession } from '@/lib/session';
import { Screen } from '@/ui/Screen';
import { Field } from '@/ui/Field';
import { Button } from '@/ui/Button';
import { ErrorText } from '@/ui/ErrorText';

type TabKind = RoutineKind;
type TabStatus = RoutineStatus;

export default function TrainerRoutinesScreen() {
  const { colors } = useBrand();
  const { apiContext } = useSession();
  const router = useRouter();

  const [tabKind, setTabKind] = useState<TabKind>('template');
  const [tabStatus, setTabStatus] = useState<TabStatus>('active');
  const [routines, setRoutines] = useState<RoutineListItem[]>([]);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const requestReload = useCallback(() => {
    setLoading(true);
    setReloadToken((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await listRoutines(apiContext, { kind: tabKind, status: tabStatus });
        if (cancelled) return;
        setRoutines(rows);
        setError(null);
      } catch {
        if (cancelled) return;
        setError('No se pudieron cargar las rutinas.');
        setRoutines([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiContext, reloadToken, tabKind, tabStatus]);

  const onCreate = async () => {
    const name = newName.trim();
    if (!name) {
      setError('Escribí un nombre para la plantilla.');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const created = await createRoutine(apiContext, { name });
      setNewName('');
      router.push(`/trainer/routines/${created.id}`);
    } catch {
      setError('No se pudo crear la rutina.');
    } finally {
      setCreating(false);
    }
  };

  const onTabKind = (kind: TabKind) => {
    setLoading(true);
    setTabKind(kind);
  };

  const onTabStatus = (status: TabStatus) => {
    setLoading(true);
    setTabStatus(status);
  };

  return (
    <Screen title="Rutinas" scroll={false}>
      <View style={styles.top}>
        <View style={styles.tabs}>
          {(
            [
              ['template', 'Plantillas'],
              ['assigned', 'Asignadas'],
            ] as const
          ).map(([key, label]) => {
            const active = tabKind === key;
            return (
              <Pressable
                key={key}
                onPress={() => onTabKind(key)}
                style={[
                  styles.tab,
                  {
                    borderColor: colors.border,
                    backgroundColor: active ? colors.primary : colors.surface,
                  },
                ]}
              >
                <Text style={{ color: active ? colors.onPrimary : colors.text, fontWeight: '600' }}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.tabs}>
          {(
            [
              ['active', 'Activas'],
              ['archived', 'Archivadas'],
            ] as const
          ).map(([key, label]) => {
            const active = tabStatus === key;
            return (
              <Pressable
                key={key}
                onPress={() => onTabStatus(key)}
                style={[
                  styles.tab,
                  {
                    borderColor: colors.border,
                    backgroundColor: active ? colors.primary : colors.surface,
                  },
                ]}
              >
                <Text style={{ color: active ? colors.onPrimary : colors.text, fontWeight: '600' }}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {tabKind === 'template' && tabStatus === 'active' ? (
          <View style={styles.create}>
            <Field
              label="Nueva plantilla"
              placeholder="Ej. Fuerza 3 días"
              value={newName}
              onChangeText={setNewName}
            />
            <Button label="Crear rutina" onPress={() => void onCreate()} loading={creating} />
          </View>
        ) : null}

        <Button label="Actualizar lista" variant="secondary" onPress={requestReload} />
        <ErrorText message={error} />
      </View>

      {loading ? (
        <Text style={{ color: colors.textMuted }}>Cargando…</Text>
      ) : (
        <FlatList
          data={routines}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={{ color: colors.textMuted }}>No hay rutinas en esta vista.</Text>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/trainer/routines/${item.id}`)}
              style={[styles.row, { borderColor: colors.border }]}
            >
              <View style={styles.rowMain}>
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 17 }}>
                  {item.name}
                </Text>
                {item.description ? (
                  <Text style={{ color: colors.textMuted }} numberOfLines={2}>
                    {item.description}
                  </Text>
                ) : null}
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                  {routineKindLabel(item.kind)} · {routineStatusLabel(item.status)}
                  {item.currentVersionNumber
                    ? ` · v${item.currentVersionNumber}${item.currentVersionStatus ? ` (${item.currentVersionStatus})` : ''}`
                    : ''}
                </Text>
              </View>
              <Text style={{ color: colors.primary, fontWeight: '600' }}>Abrir</Text>
            </Pressable>
          )}
        />
      )}

      <Link href="/trainer" asChild>
        <Button label="Volver al panel" variant="secondary" onPress={() => undefined} />
      </Link>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { gap: 12, paddingBottom: 8 },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  create: { gap: 10 },
  list: { gap: 10, paddingBottom: 16 },
  row: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowMain: { flex: 1, gap: 4 },
});
