import { useRouter } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { BodyMap, highlightsFromIntensities } from '../../components/BodyMap/BodyMap';
import { Button, EmptyState, Icon, Screen, Title } from '../../components/ui';
import { useQuery } from '../../db/client';
import { musclesOf } from '../../db/queries/exercises';
import { getRoutineItems, listRoutines } from '../../db/queries/routines';
import { startSession } from '../../db/queries/sessions';
import type { Muscle } from '../../db/schema';
import { plural } from '../../lib/format';
import { c, radius, space } from '../../lib/theme';
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
        <Button label="Nouvelle" icon="add" onPress={() => router.push('/routines/new')} />
      </View>

      <FlatList
        data={routines}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState
            icon="albums"
            title="Aucun modèle de séance"
            body="Crée « Push 1 », « Pull 1 », « Legs 1 »… Chaque modèle est une liste ordonnée d'exercices avec des séries et des reps cibles."
            action={
              <Button label="Créer ma première séance" icon="add" onPress={() => router.push('/routines/new')} />
            }
          />
        }
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

  return (
    <View style={styles.card}>
      <Pressable onPress={onOpen} style={({ pressed }) => [styles.cardMain, pressed && { opacity: 0.7 }]}>
        <View style={styles.cardText}>
          <View style={styles.nameRow}>
            <View style={[styles.dot, { backgroundColor: color ?? c.textFaint }]} />
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
          </View>
          <Text style={styles.meta}>{plural(itemCount, 'exercice')}</Text>
          <View style={styles.editHint}>
            <Text style={styles.editHintText}>Modifier</Text>
            <Icon name="chevron-forward" size={13} color={c.textFaint} />
          </View>
        </View>
        <BodyMap highlights={highlights} view="both" size={62} />
      </Pressable>
      <Button label="Lancer" icon="play" onPress={onStart} />
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
    borderWidth: 1,
    borderColor: c.border,
    padding: space.lg,
    gap: space.md,
  },
  cardMain: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  cardText: { flex: 1, gap: space.xs },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  name: { color: c.text, fontSize: 18, fontWeight: '700', flexShrink: 1 },
  meta: { color: c.textDim, fontSize: 13 },
  editHint: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: space.xs },
  editHintText: { color: c.textFaint, fontSize: 12 },
});
