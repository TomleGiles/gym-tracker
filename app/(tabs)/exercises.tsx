import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '../../components/Text';
import { Badge, Chip, EmptyState, Icon, Input, Screen, Title } from '../../components/ui';
import { useQuery } from '../../db/client';
import { listExercises, listMuscles } from '../../db/queries/exercises';
import type { ExerciseListItem } from '../../db/queries/exercises';
import type { Equipment } from '../../db/schema';
import { EQUIPMENT_LABEL, REGION_LABEL } from '../../lib/format';
import { c, radius, space } from '../../lib/theme';

const EQUIPMENTS: Equipment[] = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight'];
const REGIONS = ['chest', 'back', 'shoulders', 'arms', 'legs', 'core'] as const;

export default function ExercisesScreen() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<Equipment | null>(null);

  const muscles = useQuery(() => listMuscles(), []);

  // Le filtre affiché est une région ; la requête, elle, filtre sur les muscles
  // principaux — c'est ce qui rend « Dos » utile plutôt que littéral.
  const muscleIds = useMemo(
    () => (region ? muscles.filter((m) => m.region === region).map((m) => m.id) : undefined),
    [region, muscles],
  );

  const exercises = useQuery(
    () =>
      listExercises({
        search,
        muscleIds,
        equipment: equipment ? [equipment] : undefined,
      }),
    [search, muscleIds, equipment],
  );

  return (
    <Screen>
      <View style={styles.header}>
        <Title>Exercices</Title>
        <Input
          value={search}
          onChangeText={setSearch}
          placeholder="Rechercher (développé, squat…)"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        style={styles.filterScroll}
      >
        {REGIONS.map((r) => (
          <Chip
            key={r}
            label={REGION_LABEL[r]}
            active={region === r}
            onPress={() => setRegion(region === r ? null : r)}
          />
        ))}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        style={styles.filterScroll}
      >
        {EQUIPMENTS.map((e) => (
          <Chip
            key={e}
            label={EQUIPMENT_LABEL[e]}
            active={equipment === e}
            onPress={() => setEquipment(equipment === e ? null : e)}
          />
        ))}
      </ScrollView>

      <FlatList
        data={exercises}
        keyExtractor={(e) => e.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          exercises.length ? (
            <Text style={styles.count}>
              {exercises.length} exercice{exercises.length > 1 ? 's' : ''}
            </Text>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            icon="search"
            title="Aucun résultat"
            body="Essaie un autre mot-clé, ou retire un filtre."
          />
        }
        renderItem={({ item }) => (
          <ExerciseRow item={item} onPress={() => router.push(`/exercises/${item.id}`)} />
        )}
      />
    </Screen>
  );
}

function ExerciseRow({ item, onPress }: { item: ExerciseListItem; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
      <View style={styles.rowMain}>
        <View style={styles.rowTitleLine}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {item.labelFr}
          </Text>
          {item.isCustom ? <Badge label="perso" /> : null}
        </View>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {item.primaryLabels.join(' · ') || '—'}
        </Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.equipment}>{EQUIPMENT_LABEL[item.equipment]}</Text>
        <Icon name="chevron-forward" size={16} color={c.textFaint} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.md },
  // Un ScrollView horizontal dans une colonne flex s'effondre à 0 de haut
  // sur react-native-web : on borne explicitement.
  filterScroll: { flexGrow: 0, flexShrink: 0 },
  filterRow: {
    paddingHorizontal: space.lg,
    gap: space.sm,
    paddingVertical: space.sm,
    alignItems: 'center',
  },
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.sm },
  count: { color: c.textFaint, fontSize: 12, marginBottom: space.xs },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: c.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    minHeight: 62,
  },
  rowMain: { flex: 1, gap: 3 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  rowTitle: { color: c.text, fontSize: 15, fontWeight: '600', flexShrink: 1 },
  rowMeta: { color: c.textFaint, fontSize: 12 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  equipment: { color: c.textDim, fontSize: 11, fontWeight: '600' },
});
