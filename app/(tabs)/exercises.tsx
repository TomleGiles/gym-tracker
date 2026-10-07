import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Text } from '../../components/Text';
import { Badge, Button, Chip, EmptyState, Icon, Input, PageHeader, Screen } from '../../components/ui';
import type { IconName } from '../../components/ui';
import { useQuery } from '../../db/client';
import { listExercises, listMuscles } from '../../db/queries/exercises';
import type { ExerciseListItem } from '../../db/queries/exercises';
import type { Equipment } from '../../db/schema';
import { EQUIPMENT_LABEL, REGION_LABEL } from '../../lib/format';
import { c, radius, space, type } from '../../lib/theme';

const EQUIPMENTS: Equipment[] = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight'];
const REGIONS = ['chest', 'back', 'shoulders', 'arms', 'legs', 'core'] as const;
const EQUIPMENT_ICON: Record<Equipment, IconName> = {
  barbell: 'barbell-outline',
  dumbbell: 'fitness-outline',
  machine: 'hardware-chip-outline',
  cable: 'git-branch-outline',
  bodyweight: 'body-outline',
};

export default function ExercisesScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const columns = width >= 1500 ? 3 : width >= 1060 ? 2 : 1;
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [mechanic, setMechanic] = useState<'compound' | 'isolation' | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const muscles = useQuery(() => listMuscles(), []);
  const catalog = useQuery(() => listExercises(), []);
  const muscleIds = useMemo(
    () => (region ? muscles.filter((m) => m.region === region).map((m) => m.id) : undefined),
    [region, muscles],
  );
  const matches = useQuery(
    () => listExercises({ search, muscleIds, equipment: equipment ? [equipment] : undefined }),
    [search, muscleIds, equipment],
  );
  const exercises = useMemo(() => mechanic ? matches.filter((e) => e.mechanic === mechanic) : matches, [matches, mechanic]);
  const activeCount = Number(!!equipment) + Number(!!mechanic);
  const hasFilters = !!(search || region || equipment || mechanic);

  function resetFilters() {
    setSearch('');
    setRegion(null);
    setEquipment(null);
    setMechanic(null);
  }

  return (
    <Screen>
      <FlatList
        key={columns}
        data={exercises}
        numColumns={columns}
        keyExtractor={(e) => e.id}
        contentContainerStyle={[styles.list, width >= 900 && styles.listDesktop]}
        columnWrapperStyle={columns > 1 ? styles.columns : undefined}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.header}>
            <PageHeader
              eyebrow="LA BIBLIOTHÈQUE"
              title="Trouve ton mouvement."
              subtitle="Explore les exercices. Comprends les muscles. Affine chaque séance."
              action={<Badge label={`${catalog.length} EXERCICES`} tone="accent" icon="barbell-outline" />}
            />
            <View style={styles.searchRow}>
              <View style={styles.search}>
                <View style={styles.searchIcon}><Icon name="search-outline" size={21} color={c.textDim} /></View>
                <Input
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Un exercice, un mouvement…"
                  accessibilityLabel="Rechercher un exercice"
                  autoCorrect={false}
                  returnKeyType="search"
                  clearButtonMode="while-editing"
                  style={styles.searchInput}
                />
                {!!search && <Pressable accessibilityRole="button" accessibilityLabel="Effacer la recherche" onPress={() => setSearch('')} style={styles.clear}><Icon name="close-circle" size={19} /></Pressable>}
              </View>
              <Button
                label={activeCount ? `Filtres · ${activeCount}` : 'Filtres'}
                icon="options-outline"
                variant={showFilters || activeCount > 0 ? 'primary' : 'secondary'}
                onPress={() => setShowFilters((open) => !open)}
              />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow} style={styles.filterScroll}>
              <Chip label="Tout le corps" active={!region} onPress={() => setRegion(null)} />
              {REGIONS.map((r) => <Chip key={r} label={REGION_LABEL[r]} active={region === r} onPress={() => setRegion(region === r ? null : r)} />)}
            </ScrollView>
            {showFilters && (
              <View style={styles.filterPanel}>
                <View style={styles.filterGroup}>
                  <Text style={styles.filterLabel}>MATÉRIEL</Text>
                  <View style={styles.wrap}>
                    <Chip label="Tout" active={!equipment} onPress={() => setEquipment(null)} />
                    {EQUIPMENTS.map((e) => <Chip key={e} label={EQUIPMENT_LABEL[e]} active={equipment === e} onPress={() => setEquipment(equipment === e ? null : e)} />)}
                  </View>
                </View>
                <View style={styles.filterGroup}>
                  <Text style={styles.filterLabel}>MOUVEMENT</Text>
                  <View style={styles.wrap}>
                    <Chip label="Tous" active={!mechanic} onPress={() => setMechanic(null)} />
                    <Chip label="Polyarticulaire" active={mechanic === 'compound'} onPress={() => setMechanic(mechanic === 'compound' ? null : 'compound')} />
                    <Chip label="Isolation" active={mechanic === 'isolation'} onPress={() => setMechanic(mechanic === 'isolation' ? null : 'isolation')} />
                  </View>
                </View>
              </View>
            )}
            <View style={styles.resultsHeader}>
              <View style={styles.wrap}>
                <Text style={styles.count}>{exercises.length} mouvement{exercises.length > 1 ? 's' : ''}</Text>
                {equipment && !showFilters && <Badge label={EQUIPMENT_LABEL[equipment]} />}
                {mechanic && !showFilters && <Badge label={mechanic === 'compound' ? 'Polyarticulaire' : 'Isolation'} />}
              </View>
              {hasFilters ? (
                <Pressable accessibilityRole="button" onPress={resetFilters} style={styles.reset}><Text style={styles.resetText}>Tout effacer</Text><Icon name="close" size={14} color={c.textDim} /></Pressable>
              ) : <Text style={styles.sort}>A — Z</Text>}
            </View>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="search-outline"
            title="On change de piste ?"
            body="Aucun exercice ne correspond à cette combinaison. Retire un filtre ou essaie un autre mot."
            action={<Button label="Réinitialiser les filtres" icon="refresh-outline" onPress={resetFilters} />}
          />
        }
        renderItem={({ item }) => (
          <View style={[styles.item, columns > 1 && { maxWidth: `${100 / columns}%` }]}>
            <ExerciseCard item={item} onPress={() => router.push(`/exercises/${item.id}`)} />
          </View>
        )}
      />
    </Screen>
  );
}

function ExerciseCard({ item, onPress }: { item: ExerciseListItem; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Voir ${item.labelFr}`} onPress={onPress} style={({ pressed }) => [styles.card, pressed && { backgroundColor: c.surfaceAlt, transform: [{ scale: 0.99 }] }]}>
      <View style={styles.cardMain}>
        <View style={styles.exerciseIcon}><Icon name={EQUIPMENT_ICON[item.equipment]} size={24} color={c.accent} /></View>
        <View style={styles.rowMain}>
          <Text style={styles.rowTitle} numberOfLines={2}>{item.labelFr}</Text>
          <Text style={styles.rowMeta} numberOfLines={2}>{item.primaryLabels.join(' · ') || 'Muscles non renseignés'}</Text>
        </View>
        <Icon name="arrow-up-right-box-outline" size={18} color={c.textFaint} />
      </View>
      <View style={styles.cardFoot}>
        <View style={styles.wrap}>
          <Text style={styles.equipment}>{EQUIPMENT_LABEL[item.equipment]}</Text>
          <Text style={styles.separator}>/</Text>
          <Text style={styles.mechanic}>{item.mechanic === 'compound' ? 'Polyarticulaire' : 'Isolation'}</Text>
        </View>
        {item.isCustom ? <Badge label="PERSO" tone="accent" /> : item.isUnilateral ? <Badge label="UNILATÉRAL" /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { padding: space.lg, paddingBottom: 40, gap: space.md },
  listDesktop: { padding: 32 },
  columns: { gap: space.md },
  header: { gap: 20, marginBottom: 2 },
  searchRow: { flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 6 },
  search: { flex: 1, minWidth: 0, position: 'relative' },
  searchInput: { paddingLeft: 44, paddingRight: 38, height: 50 },
  searchIcon: { position: 'absolute', left: 15, top: 15, zIndex: 1, pointerEvents: 'none' },
  clear: { position: 'absolute', right: 5, top: 3, width: 34, height: 44, alignItems: 'center', justifyContent: 'center' },
  filterScroll: { flexGrow: 0, flexShrink: 0 },
  filterRow: { gap: space.sm, alignItems: 'center', paddingVertical: 2 },
  filterPanel: { padding: 20, backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, gap: 20 },
  filterGroup: { gap: 10 },
  filterLabel: { ...type.overline, fontSize: 10 },
  wrap: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  resultsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, minHeight: 40 },
  count: { color: c.textDim, fontSize: 12, fontWeight: '600' },
  sort: { ...type.overline, fontSize: 10 },
  reset: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 40 },
  resetText: { color: c.textDim, fontSize: 12 },
  item: { flex: 1, minWidth: 0 },
  card: { flex: 1, backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: 20, gap: 20 },
  cardMain: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 60 },
  exerciseIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: c.accentDim, alignItems: 'center', justifyContent: 'center' },
  rowMain: { flex: 1, minWidth: 0, gap: 6 },
  rowTitle: { color: c.text, fontSize: 15, lineHeight: 21, fontWeight: '600' },
  rowMeta: { color: c.textFaint, fontSize: 12, lineHeight: 17 },
  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 14 },
  equipment: { color: c.textDim, fontSize: 11, fontWeight: '500' },
  mechanic: { color: c.textFaint, fontSize: 11 },
  separator: { color: c.borderStrong, fontSize: 13 },
});
