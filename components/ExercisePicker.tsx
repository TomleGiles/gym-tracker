import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from './Text';
import { useQuery } from '../db/client';
import { listExercises, listMuscles } from '../db/queries/exercises';
import type { Equipment } from '../db/schema';
import { EQUIPMENT_LABEL, REGION_LABEL } from '../lib/format';
import { c, font, radius, space } from '../lib/theme';
import { Badge, Chip, EmptyState, Icon, IconButton, Input } from './ui';

const EQUIPMENTS: Equipment[] = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight'];
const REGIONS = ['chest', 'back', 'shoulders', 'arms', 'legs', 'core'] as const;

/**
 * Sélecteur d'exercice, partagé entre l'édition d'un modèle et l'ajout à la
 * volée pendant une séance. Reste monté fermé pour que la recherche soit
 * instantanée à l'ouverture.
 */
export function ExercisePicker({
  visible,
  onClose,
  onPick,
  title = 'Ajouter un exercice',
  /** Ids déjà présents — grisés mais toujours sélectionnables (séries doubles). */
  alreadyIn = [],
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (exerciseId: string) => void;
  title?: string;
  alreadyIn?: string[];
}) {
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<Equipment | null>(null);

  const muscles = useQuery(() => listMuscles(), []);
  const muscleIds = useMemo(
    () => (region ? muscles.filter((m) => m.region === region).map((m) => m.id) : undefined),
    [region, muscles],
  );
  const exercises = useQuery(
    () => listExercises({ search, muscleIds, equipment: equipment ? [equipment] : undefined }),
    [search, muscleIds, equipment],
  );

  const present = new Set(alreadyIn);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent={false}>
      <SafeAreaView style={styles.sheet} edges={['top', 'bottom']}>
        <View style={styles.content}>
        <View style={styles.head}>
          <View style={styles.headingCopy}><Text style={styles.eyebrow}>COMPOSE TA SÉANCE</Text><Text style={styles.title}>{title}</Text></View>
          <IconButton name="close" onPress={onClose} accessibilityLabel="Fermer" color={c.text} />
        </View>

        <View style={styles.searchWrap}>
          <Input
            value={search}
            onChangeText={setSearch}
            placeholder="Rechercher un exercice"
            autoCorrect={false}
            autoFocus
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filters}
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
          style={styles.filterScroll}
          contentContainerStyle={styles.filters}
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

        <View style={styles.results}><Text style={styles.resultsLabel}>{exercises.length} exercice{exercises.length > 1 ? 's' : ''} disponible{exercises.length > 1 ? 's' : ''}</Text>{search || region || equipment ? <Pressable accessibilityRole="button" onPress={() => { setSearch(''); setRegion(null); setEquipment(null); }}><Text style={styles.reset}>Tout effacer</Text></Pressable> : null}</View>

        <FlatList
          data={exercises}
          keyExtractor={(e) => e.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState icon="search" title="Aucun résultat" body="Essaie un autre mot-clé." />
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Ajouter ${item.labelFr}`}
              onPress={() => onPick(item.id)}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
            >
              <View style={styles.exerciseIcon}><Icon name="barbell-outline" size={21} color={c.accent} /></View>
              <View style={styles.rowMain}>
                <Text style={[styles.rowTitle, present.has(item.id) && { color: c.textDim }]} numberOfLines={1}>
                  {item.labelFr}
                </Text>
                <Text style={styles.rowMeta} numberOfLines={1}>
                  {EQUIPMENT_LABEL[item.equipment]} · {item.primaryLabels.join(' · ')}
                </Text>
              </View>
              {present.has(item.id) ? <Badge label="Ajouté" tone="ok" /> : <Icon name="add-circle-outline" size={23} color={c.textDim} />}
            </Pressable>
          )}
        />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: c.bg },
  content: { flex: 1, width: '100%', maxWidth: 840, alignSelf: 'center' },
  headingCopy: { gap: space.xs, flex: 1 },
  eyebrow: { color: c.accent, fontSize: 9, fontWeight: '700', letterSpacing: 1.6 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: space.lg,
    paddingRight: space.sm,
    paddingVertical: space.lg,
  },
  title: { ...font.display, color: c.text, fontSize: 32 },
  results: { paddingHorizontal: space.lg, paddingVertical: space.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  resultsLabel: { color: c.textFaint, fontSize: 11 },
  reset: { color: c.accent, fontSize: 11, fontWeight: '600' },
  searchWrap: { paddingHorizontal: space.lg },
  filterScroll: { flexGrow: 0, flexShrink: 0 },
  filters: {
    paddingHorizontal: space.lg,
    gap: space.sm,
    paddingVertical: space.sm,
    alignItems: 'center',
  },
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: c.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: 60,
  },
  rowMain: { flex: 1, gap: 2 },
  exerciseIcon: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: c.accentDim, justifyContent: 'center', alignItems: 'center' },
  rowTitle: { color: c.text, fontSize: 15, fontWeight: '600' },
  rowMeta: { color: c.textFaint, fontSize: 12 },
  equipment: { color: c.textDim, fontSize: 11, fontWeight: '600' },
});
