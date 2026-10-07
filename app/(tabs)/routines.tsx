import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Text } from '../../components/Text';
import { BodyMap, highlightsFromIntensities } from '../../components/BodyMap/BodyMap';
import { ProgramPicker } from '../../components/ProgramPicker';
import { Badge, Button, Chip, Icon, PageHeader, Screen } from '../../components/ui';
import { useQuery } from '../../db/client';
import { musclesOf } from '../../db/queries/exercises';
import { getRoutineItems, listRoutines } from '../../db/queries/routines';
import { startSession } from '../../db/queries/sessions';
import type { Muscle } from '../../db/schema';
import { plural } from '../../lib/format';
import { c, font, radius, space, type } from '../../lib/theme';
import { ROLE_WEIGHT } from '../../lib/volume';
import { useActiveSession } from '../../stores/activeSession';

export default function RoutinesScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const columns = width >= 1100 ? 2 : 1;
  const [tab, setTab] = useState<'routines' | 'programs'>('routines');
  const routines = useQuery(() => listRoutines(), []);
  const resetSessionUi = useActiveSession((s) => s.reset);

  return (
    <Screen>
      <FlatList
        key={columns}
        data={tab === 'routines' ? routines : []}
        numColumns={columns}
        keyExtractor={(r) => r.id}
        contentContainerStyle={[styles.list, width >= 900 && styles.listDesktop]}
        columnWrapperStyle={columns > 1 ? styles.columns : undefined}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.header}>
            <PageHeader
              eyebrow="TON TERRAIN DE JEU"
              title="Le plan. Puis l'action."
              subtitle="Tes séances, tes exercices, ton rythme. Construis ce qui te fait avancer."
              action={<Button label="Créer une séance" icon="add" onPress={() => router.push('/routines/new')} />}
            />
            <View style={styles.toolbar}>
              <View style={styles.tabs}>
                <Chip label={`Mes séances · ${routines.length}`} active={tab === 'routines'} onPress={() => setTab('routines')} />
                <Chip label="Programmes" active={tab === 'programs'} onPress={() => setTab('programs')} />
              </View>
              {width >= 650 && <Text style={styles.hint}>PRÉPARE · LANCE · PROGRESSE</Text>}
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            {tab === 'routines' && (
              <View style={styles.emptyIntro}>
                <Icon name="albums-outline" size={24} color={c.accent} />
                <View style={styles.flex}>
                  <Text style={type.h3}>Ta prochaine séance commence ici.</Text>
                  <Text style={[type.small, { marginTop: 4 }]}>Pars d'un programme prêt à l'emploi ou crée ta propre séance.</Text>
                </View>
              </View>
            )}
            <ProgramPicker />
          </View>
        }
        ListFooterComponent={routines.length && tab === 'routines' ? (
          <Pressable accessibilityRole="button" onPress={() => setTab('programs')} style={({ pressed }) => [styles.discover, pressed && styles.pressed]}>
            <View style={styles.discoverIcon}><Icon name="sparkles-outline" size={20} color={c.accent} /></View>
            <View style={styles.flex}>
              <Text style={type.h3}>Envie d'un nouveau rythme ?</Text>
              <Text style={type.small}>Découvre nos programmes prêts à personnaliser.</Text>
            </View>
            <Icon name="arrow-forward" size={22} color={c.accent} />
          </Pressable>
        ) : null}
        renderItem={({ item, index }) => (
          <View style={[styles.cardWrap, columns > 1 && { maxWidth: '50%' }]}>
            <RoutineCard
              id={item.id}
              name={item.name}
              color={item.color}
              itemCount={item.itemCount}
              index={index}
              onOpen={() => router.push(`/routines/${item.id}`)}
              onStart={() => {
                resetSessionUi();
                router.push(`/session/${startSession(item.id)}`);
              }}
            />
          </View>
        )}
      />
    </Screen>
  );
}

function RoutineCard({ id, name, color, itemCount, index, onOpen, onStart }: {
  id: string; name: string; color: string | null; itemCount: number; index: number;
  onOpen: () => void; onStart: () => void;
}) {
  const details = useQuery(() => {
    const items = getRoutineItems(id);
    const byExercise = musclesOf(items.map((i) => i.exerciseId));
    const load = new Map<string, { muscle: Muscle; sets: number }>();
    for (const item of items) {
      for (const { muscle, role } of byExercise.get(item.exerciseId) ?? []) {
        const weight = ROLE_WEIGHT[role];
        if (!weight) continue;
        const entry = load.get(muscle.id) ?? { muscle, sets: 0 };
        entry.sets += item.targetSets * weight;
        load.set(muscle.id, entry);
      }
    }
    const peak = Math.max(...[...load.values()].map((e) => e.sets), 1);
    return {
      highlights: highlightsFromIntensities([...load.values()].map((e) => ({ muscle: e.muscle, intensity: e.sets / peak }))),
      exercises: items.map((i) => i.exercise.labelFr),
      sets: items.reduce((total, i) => total + i.targetSets, 0),
    };
  }, [id]);
  const tint = color ?? c.accent;

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.cardLabel}><View style={[styles.dot, { backgroundColor: tint }]} /><Text style={styles.overline}>TA SÉANCE</Text></View>
        <Text style={styles.cardIndex}>{String(index + 1).padStart(2, '0')}</Text>
      </View>
      <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`Voir et modifier ${name}`} style={({ pressed }) => [styles.cardMain, pressed && styles.pressed]}>
        <View style={styles.cardText}>
          <Text style={styles.name} numberOfLines={2}>{name}</Text>
          <View style={styles.meta}><Badge label={plural(itemCount, 'exercice')} /><Badge label={plural(details.sets, 'série')} /></View>
          <Text style={styles.preview} numberOfLines={3}>{details.exercises.join(' · ') || 'Ajoute tes premiers exercices pour composer cette séance.'}</Text>
        </View>
        <View style={styles.anatomy}><BodyMap highlights={details.highlights} view="both" size={48} /></View>
      </Pressable>
      <View style={styles.cardFoot}>
        <Button label="Personnaliser" icon="create-outline" variant="ghost" onPress={onOpen} />
        <Button label="Lancer" icon="play" onPress={onStart} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: space.lg, paddingBottom: 40, gap: space.lg },
  listDesktop: { padding: 32 },
  header: { gap: 28, marginBottom: 4 },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, flexWrap: 'wrap' },
  tabs: { flexDirection: 'row', gap: space.sm },
  hint: { ...type.overline, fontSize: 9, letterSpacing: 1.7 },
  columns: { gap: space.lg },
  cardWrap: { flex: 1, minWidth: 0 },
  card: { flex: 1, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.xl, padding: space.xl, overflow: 'hidden' },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.lg },
  cardLabel: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dot: { width: 7, height: 7, borderRadius: 4 },
  overline: { ...type.overline, fontSize: 10 },
  cardIndex: { ...font.tabular, color: c.textFaint, fontSize: 12 },
  cardMain: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 164 },
  cardText: { flex: 1, minWidth: 0, gap: 12 },
  name: { ...font.display, fontSize: 38, lineHeight: 40, color: c.text },
  meta: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  preview: { ...type.caption, lineHeight: 19 },
  anatomy: { opacity: 0.88, paddingVertical: 8 },
  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: c.border, marginTop: 22, paddingTop: 16, gap: 8, flexWrap: 'wrap' },
  emptyWrap: { gap: 24 },
  emptyIntro: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 20, backgroundColor: c.accentDim, borderRadius: radius.lg },
  discover: { padding: space.xl, flexDirection: 'row', alignItems: 'center', gap: space.lg, borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: c.borderStrong, marginTop: 8 },
  discoverIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: c.accentDim, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
});
