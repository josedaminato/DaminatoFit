import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useBrand } from '@/brand/BrandProvider';
import { ExerciseCard } from '@/features/exercises/ExerciseCard';
import { listExercises, listMuscleGroups } from '@/features/exercises/exercise-api';
import type { Exercise, ExerciseListScope, MuscleGroup } from '@/features/exercises/types';
import { useSession } from '@/lib/session';
import { Screen } from '@/ui/Screen';
import { Field } from '@/ui/Field';
import { Button } from '@/ui/Button';
import { ErrorText } from '@/ui/ErrorText';

type TabScope = 'global' | 'mine';

export default function TrainerExercisesScreen() {
  const { colors } = useBrand();
  const { apiContext } = useSession();
  const router = useRouter();

  const [tab, setTab] = useState<TabScope>('global');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [muscleFilter, setMuscleFilter] = useState<string | null>(null);
  const [muscleGroups, setMuscleGroups] = useState<MuscleGroup[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listMuscleGroups(apiContext)
      .then((groups) => {
        if (!cancelled) setMuscleGroups(groups);
      })
      .catch(() => {
        if (!cancelled) setError('No se pudieron cargar los grupos musculares.');
      });
    return () => {
      cancelled = true;
    };
  }, [apiContext]);

  const apiScope: ExerciseListScope = tab;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await listExercises(apiContext, {
          scope: apiScope,
          q: search,
          muscle: muscleFilter ?? undefined,
        });
        if (cancelled) return;
        setExercises(rows);
        setError(null);
      } catch {
        if (cancelled) return;
        setError('No se pudo cargar la biblioteca de ejercicios.');
        setExercises([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiContext, apiScope, muscleFilter, search]);

  const muscleNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const mg of muscleGroups) map.set(mg.id, mg.name);
    return map;
  }, [muscleGroups]);

  const applySearch = () => {
    setLoading(true);
    setSearch(query.trim());
  };

  const onChangeTab = (key: TabScope) => {
    setLoading(true);
    setTab(key);
  };

  const onChangeMuscle = (id: string | null) => {
    setLoading(true);
    setMuscleFilter(id);
  };

  return (
    <Screen title="Biblioteca de ejercicios" scroll={false}>
      <View style={styles.top}>
        <View style={styles.tabs}>
          {(
            [
              ['global', 'Global'],
              ['mine', 'Propios'],
            ] as const
          ).map(([key, label]) => {
            const active = tab === key;
            return (
              <Pressable
                key={key}
                onPress={() => onChangeTab(key)}
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

        <Field
          label="Buscar"
          placeholder="Nombre del ejercicio"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={applySearch}
          returnKeyType="search"
        />
        <Button label="Buscar" variant="secondary" onPress={applySearch} />

        <Text style={[styles.filterLabel, { color: colors.text }]}>Filtrar por músculo</Text>
        <View style={styles.chips}>
          <Pressable
            onPress={() => onChangeMuscle(null)}
            style={[
              styles.chip,
              {
                borderColor: colors.border,
                backgroundColor: !muscleFilter ? colors.primary : colors.surface,
              },
            ]}
          >
            <Text style={{ color: !muscleFilter ? colors.onPrimary : colors.text }}>Todos</Text>
          </Pressable>
          {muscleGroups.map((mg) => {
            const active = muscleFilter === mg.id;
            return (
              <Pressable
                key={mg.id}
                onPress={() => onChangeMuscle(active ? null : mg.id)}
                style={[
                  styles.chip,
                  {
                    borderColor: colors.border,
                    backgroundColor: active ? colors.primary : colors.surface,
                  },
                ]}
              >
                <Text style={{ color: active ? colors.onPrimary : colors.text }}>{mg.name}</Text>
              </Pressable>
            );
          })}
        </View>

        <Link href="/trainer/exercises/create" asChild>
          <Button label="Nuevo ejercicio" onPress={() => undefined} />
        </Link>
        <ErrorText message={error} />
      </View>

      {loading ? (
        <Text style={{ color: colors.textMuted }}>Cargando…</Text>
      ) : (
        <FlatList
          data={exercises}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={{ color: colors.textMuted }}>No hay ejercicios para mostrar.</Text>
          }
          renderItem={({ item }) => (
            <ExerciseCard
              exercise={item}
              subtitle={
                item.revision.primaryMuscleGroupId
                  ? (muscleNameById.get(item.revision.primaryMuscleGroupId) ?? null)
                  : null
              }
              onPress={() => router.push(`/trainer/exercises/${item.id}`)}
            />
          )}
        />
      )}
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
  filterLabel: { fontSize: 15, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  list: { gap: 10, paddingBottom: 24 },
});
