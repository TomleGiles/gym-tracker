import { useRouter } from 'expo-router';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '../../components/Text';
import { BodyMap, highlightsFromIntensities } from '../../components/BodyMap/BodyMap';
import { ProgramPicker } from '../../components/ProgramPicker';
import { Button, GradientFill, Icon, Screen, Title } from '../../components/ui';
import { useQuery } from '../../db/client';
import { musclesOf } from '../../db/queries/exercises';
import { getRoutineItems, listRoutines } from '../../db/queries/routines';
import { startSession } from '../../db/queries/sessions';
import type { Muscle } from '../../db/schema';
import { plural } from '../../lib/format';
import { HIT, c, radius, space, type } from '../../lib/theme';
import { ROLE_WEIGHT } from '../../lib/volume';
import { useActiveSession } from '../../stores/activeSession';

export default function RoutinesScreen() {
  const router = useRouter();
  const routines = useQuery(() => listRoutines(), []);
  const resetSessionUi = useActiveSession((s) => s.reset);

  return (
    <Screen>
      <View style={styles.header}>
        <Title>Séances</Title>
        <Button label="Nouvelle" icon="add" variant="secondary" onPress={() => router.push('/routines/new')} />
      </View>

      <FlatList
        data={routines}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<ProgramPicker />}
        renderItem={({ item }) => (
          <RoutineCard
            id={item.id}
            name={item.name}
            color={item.color}
            itemCount={item.itemCount}
            onOpen={() => router.push(`/routines/${item.id}`)}
            onStart={() => {
              resetSessionUi();
              router.push(`/session/${startSession(item.id)}`);
            }}
          />
        )}
      />
    </Screen>
  );
}

function RoutineCard({
  id,
  name,
  color,
  itemCount,
  onOpen,
  onStart,
}: {
  id: string;
  name: string;
  color: string | null;
  itemCount: number;
  onOpen: () => void;
  onStart: () => void;
}) {
  // Aperçu de séance (§4, usage 2) : union des muscles, pondérée par le nombre
  // de séries cibles — c'est ce qui répond à « est-ce que je couvre mon dos ? ».
  const highlights = useQuery(() => {
    const items = getRoutineItems(id);
    if (!items.length) return {};
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
    return highlightsFromIntensities(
      [...load.values()].map((e) => ({ muscle: e.muscle, intensity: e.sets / peak })),
    );
  }, [id]);

  const exercises = useQuery(() => getRoutineItems(id).map((i) => i.exercise.labelFr), [id]);
  const tint = color ?? c.textFaint;

  return (
    // Deux zones sœurs plutôt qu'une carte cliquable contenant le bouton lecture :
    // un bouton dans un bouton est invalide en HTML et ambigu au toucher.
    <View style={styles.card}>
      <View style={[styles.stripe, { backgroundColor: tint }]} />
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`Modifier ${name}`}
        style={({ pressed }) => [styles.cardMain, pressed && { opacity: 0.7 }]}
      >
        <View style={styles.cardText}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.meta}>{plural(itemCount, 'exercice')}</Text>
          {exercises.length ? (
            <Text style={styles.preview} numberOfLines={2}>
              {exercises.join(' · ')}
            </Text>
          ) : null}
        </View>
        <BodyMap highlights={highlights} view="both" size={58} />
      </Pressable>
      <View style={styles.cardFoot}>
        <Pressable onPress={onOpen} hitSlop={8} style={styles.editHint}>
          <Icon name="create-outline" size={15} color={c.textFaint} />
          <Text style={styles.editHintText}>Modifier</Text>
        </Pressable>
        <Pressable
          onPress={onStart}
          accessibilityRole="button"
          accessibilityLabel={`Lancer ${name}`}
          hitSlop={6}
          style={({ pressed }) => [styles.play, pressed && { transform: [{ scale: 0.94 }] }]}
        >
          <GradientFill borderRadius={26} />
          <Icon name="play" size={22} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.md,
    gap: space.md,
  },
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.md },
  card: {
    backgroundColor: c.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    paddingLeft: space.lg + 6,
    gap: space.md,
    overflow: 'hidden',
  },
  stripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5 },
  cardMain: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  cardText: { flex: 1, gap: 2 },
  name: { ...type.hero, fontSize: 34, lineHeight: 38 },
  meta: { ...type.small },
  preview: { ...type.caption, lineHeight: 17, marginTop: space.xs },
  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  editHint: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: HIT },
  editHintText: { color: c.textFaint, fontSize: 13, fontWeight: '600' },
  play: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
