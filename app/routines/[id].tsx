import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { Text } from '../../components/Text';
import { BodyMap, highlightsFromIntensities } from '../../components/BodyMap/BodyMap';
import { ExercisePicker } from '../../components/ExercisePicker';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Icon,
  IconButton,
  Input,
  PageHeader,
  Screen,
  SectionTitle,
} from '../../components/ui';
import { useQuery } from '../../db/client';
import { musclesOf } from '../../db/queries/exercises';
import {
  addExerciseToRoutine,
  deleteRoutine,
  duplicateRoutine,
  getRoutine,
  moveRoutineItem,
  removeRoutineItem,
  updateRoutine,
  updateRoutineItem,
} from '../../db/queries/routines';
import { startSession } from '../../db/queries/sessions';
import type { Muscle } from '../../db/schema';
import { EQUIPMENT_LABEL, plural } from '../../lib/format';
import { HIT, c, font, radius, space } from '../../lib/theme';
import { ROLE_WEIGHT } from '../../lib/volume';
import { useActiveSession } from '../../stores/activeSession';

export default function RoutineEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const resetSessionUi = useActiveSession((s) => s.reset);
  const narrow = useWindowDimensions().width < 500;

  const routine = useQuery(() => getRoutine(id), [id]);
  const [picking, setPicking] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState('');

  const highlights = useQuery(() => {
    const r = getRoutine(id);
    if (!r?.items.length) return {};
    const byExercise = musclesOf(r.items.map((i) => i.exerciseId));
    const load = new Map<string, { muscle: Muscle; sets: number }>();
    for (const item of r.items) {
      for (const { muscle, role } of byExercise.get(item.exerciseId) ?? []) {
        const w = ROLE_WEIGHT[role];
        if (!w) continue;
        const entry = load.get(muscle.id) ?? { muscle, sets: 0 };
        entry.sets += item.targetSets * w;
        load.set(muscle.id, entry);
      }
    }
    const peak = Math.max(...[...load.values()].map((e) => e.sets), 1);
    return highlightsFromIntensities(
      [...load.values()].map((e) => ({ muscle: e.muscle, intensity: e.sets / peak })),
    );
  }, [id]);

  if (!routine) {
    return (
      <Screen>
        <EmptyState icon="alert-circle" title="Séance introuvable" body="Elle a peut-être été supprimée." />
      </Screen>
    );
  }

  const totalSets = routine.items.reduce((acc, i) => acc + i.targetSets, 0);

  function confirmDelete() {
    const remove = () => {
      deleteRoutine(id);
      router.back();
    };
    if (Platform.OS === 'web') {
      // Alert.alert n'affiche pas de boutons sur react-native-web.
      // eslint-disable-next-line no-alert
      if (window.confirm(`Supprimer « ${routine!.name} » ? L'historique est conservé.`)) remove();
      return;
    }
    Alert.alert('Supprimer cette séance ?', "Les séances déjà réalisées restent dans l'historique.", [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: remove },
    ]);
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: routine.name,
          headerRight: () => (
            <IconButton
              name="copy-outline"
              accessibilityLabel="Dupliquer"
              onPress={() => {
                const copy = duplicateRoutine(id);
                if (copy) router.replace(`/routines/${copy}`);
              }}
            />
          ),
        }}
      />
      <Screen scroll edges={[]}>
        <PageHeader eyebrow="ATELIER D'ENTRAÎNEMENT" title="Une séance à ton image." subtitle="Ajuste ton programme. Chaque détail se sauvegarde au fil de tes modifications." />
        <Card>
          <View style={styles.headRow}>
            <View style={styles.headText}>
              {renaming ? (
                <Input
                  value={draftName}
                  onChangeText={setDraftName}
                  autoFocus
                  onBlur={() => {
                    if (draftName.trim()) updateRoutine(id, { name: draftName.trim() });
                    setRenaming(false);
                  }}
                  returnKeyType="done"
                />
              ) : (
                <Pressable
                  onPress={() => {
                    setDraftName(routine.name);
                    setRenaming(true);
                  }}
                >
                  <View style={styles.nameRow}>
                    <View style={[styles.dot, { backgroundColor: routine.color ?? c.textFaint }]} />
                    <Text style={[styles.name, narrow && styles.nameNarrow]}>{routine.name}</Text>
                    <Icon name="pencil" size={14} color={c.textFaint} />
                  </View>
                </Pressable>
              )}
              <Text style={styles.meta}>
                {plural(routine.items.length, 'exercice')} · {plural(totalSets, 'série')} au programme
              </Text>
            </View>
            <BodyMap highlights={highlights} view="both" size={narrow ? 60 : 80} />
          </View>

          <View style={styles.colorRow}>
            {c.routineColors.map((col) => (
              <Pressable
                key={col}
                onPress={() => updateRoutine(id, { color: col })}
                accessibilityRole="button"
                accessibilityLabel={`Couleur ${col}`}
                style={[
                  styles.swatch,
                  { backgroundColor: col },
                  routine.color === col && styles.swatchActive,
                ]}
              />
            ))}
          </View>
          {routine.items.length > 0 ? (
            <Button label="Démarrer la séance" icon="play" size="lg" style={{ marginTop: space.xl }} onPress={() => { resetSessionUi(); router.push(`/session/${startSession(id)}`); }} />
          ) : null}
        </Card>

        <SectionTitle
          right={<Button label="Ajouter" icon="add" variant="secondary" onPress={() => setPicking(true)} />}
        >
          Exercices
        </SectionTitle>

        {routine.items.length === 0 ? (
          <Card>
            <EmptyState
              icon="barbell"
              title="Séance vide"
              body="Ajoute les exercices dans l'ordre où tu comptes les faire."
              action={<Button label="Ajouter un exercice" icon="add" onPress={() => setPicking(true)} />}
            />
          </Card>
        ) : (
          routine.items.map((item, index) => (
            <Card key={item.id} style={styles.item}>
              <View style={styles.itemHead}>
                <Text style={styles.position}>{String(index + 1).padStart(2, '0')}</Text>
                <Pressable
                  style={styles.itemTitleWrap}
                  onPress={() => router.push(`/exercises/${item.exerciseId}`)}
                >
                  <Text style={styles.itemTitle} numberOfLines={2}>
                    {item.exercise.labelFr}
                  </Text>
                  <Badge label={EQUIPMENT_LABEL[item.exercise.equipment]} />
                </Pressable>
                <View style={styles.moveCol}>
                  <IconButton
                    name="chevron-up"
                    size={18}
                    accessibilityLabel="Monter"
                    style={styles.moveBtn}
                    disabled={index === 0}
                    onPress={() => moveRoutineItem(id, item.id, -1)}
                  />
                  <IconButton
                    name="chevron-down"
                    size={18}
                    accessibilityLabel="Descendre"
                    style={styles.moveBtn}
                    disabled={index === routine.items.length - 1}
                    onPress={() => moveRoutineItem(id, item.id, 1)}
                  />
                </View>
                <IconButton
                  name="trash-outline"
                  accessibilityLabel="Retirer de la séance"
                  color={c.danger}
                  onPress={() => removeRoutineItem(item.id)}
                />
              </View>

              {/* Les deux compteurs d'abord : sur téléphone ils partagent une ligne et les reps passent dessous. */}
              <View style={styles.targets}>
                <Stepper
                  label="Séries"
                  value={String(item.targetSets)}
                  onDec={() =>
                    updateRoutineItem(item.id, { targetSets: Math.max(1, item.targetSets - 1) })
                  }
                  onInc={() =>
                    updateRoutineItem(item.id, { targetSets: Math.min(12, item.targetSets + 1) })
                  }
                />
                <Stepper
                  label="Repos"
                  value={`${item.restSeconds ?? 120}s`}
                  onDec={() =>
                    updateRoutineItem(item.id, {
                      restSeconds: Math.max(30, (item.restSeconds ?? 120) - 30),
                    })
                  }
                  onInc={() =>
                    updateRoutineItem(item.id, {
                      restSeconds: Math.min(600, (item.restSeconds ?? 120) + 30),
                    })
                  }
                />
                <View style={styles.repsField}>
                  <Text style={styles.stepperLabel}>Reps</Text>
                  <Input
                    defaultValue={item.targetReps ?? ''}
                    placeholder="8-10"
                    onEndEditing={(e) =>
                      updateRoutineItem(item.id, { targetReps: e.nativeEvent.text.trim() || null })
                    }
                    style={styles.repsInput}
                  />
                </View>
              </View>
            </Card>
          ))
        )}

        {routine.items.length > 0 ? (
          <Button
            label="Lancer cette séance"
            icon="play"
            size="lg"
            onPress={() => {
              resetSessionUi();
              router.push(`/session/${startSession(id)}`);
            }}
          />
        ) : null}

        <Button label="Supprimer la séance" variant="danger" icon="trash-outline" onPress={confirmDelete} />
      </Screen>

      <ExercisePicker
        visible={picking}
        onClose={() => setPicking(false)}
        alreadyIn={routine.items.map((i) => i.exerciseId)}
        onPick={(exerciseId) => {
          addExerciseToRoutine(id, exerciseId);
          setPicking(false);
        }}
      />
    </>
  );
}

function Stepper({
  label,
  value,
  onDec,
  onInc,
}: {
  label: string;
  value: string;
  onDec: () => void;
  onInc: () => void;
}) {
  return (
    <View style={styles.stepper}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepperRow}>
        <IconButton name="remove" size={16} accessibilityLabel={`${label} moins`} onPress={onDec} />
        <Text style={[styles.stepperValue, font.tabular]}>{value}</Text>
        <IconButton name="add" size={16} accessibilityLabel={`${label} plus`} onPress={onInc} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  headText: { flex: 1, gap: space.xs },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  name: { ...font.display, flexShrink: 1, color: c.text, fontSize: 36 },
  nameNarrow: { fontSize: 30 },
  meta: { color: c.textDim, fontSize: 13 },
  colorRow: { flexDirection: 'row', gap: space.sm, marginTop: space.lg },
  swatch: { width: 28, height: 28, borderRadius: radius.pill, borderWidth: 2, borderColor: 'transparent' },
  swatchActive: { borderColor: c.text },

  item: { padding: space.lg, gap: space.lg },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  position: {
    ...font.display,
    color: c.accent,
    fontSize: 28,
    width: 34,
    textAlign: 'center',
    paddingTop: 2,
  },
  itemTitleWrap: { flex: 1, gap: space.xs, alignItems: 'flex-start' },
  itemTitle: { color: c.text, fontSize: 16, fontWeight: '600' },
  moveCol: { justifyContent: 'center' },
  moveBtn: { height: 28, width: 36 },

  targets: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: space.md, paddingTop: space.md, borderTopWidth: 1, borderTopColor: c.border },
  stepper: { flexGrow: 1, gap: 4 },
  stepperLabel: { color: c.textFaint, fontSize: 12, fontWeight: '600' },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: c.surfaceAlt,
    borderRadius: radius.md,
  },
  stepperValue: { color: c.text, fontSize: 15, fontWeight: '700', minWidth: 34, textAlign: 'center' },
  repsField: { flexGrow: 1, minWidth: 120, gap: 4 },
  repsInput: { minHeight: HIT, textAlign: 'center', fontSize: 15 },
});
