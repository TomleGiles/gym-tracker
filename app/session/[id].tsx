import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '../../components/Text';
import { ExercisePicker } from '../../components/ExercisePicker';
import { NumPad, formatFr, parseFr } from '../../components/NumPad';
import type { NumPadRequest } from '../../components/NumPad';
import { RestTimer } from '../../components/RestTimer';
import { SetRow, setRowStyles } from '../../components/SetRow';
import { Badge, Button, EmptyState, Icon, IconButton, Loading } from '../../components/ui';
import { useQuery } from '../../db/client';
import {
  addExerciseToSession,
  deleteSet,
  discardSession,
  endSession,
  getSession,
  getSessionView,
  logSet,
  removeExerciseFromSession,
  updateSet,
} from '../../db/queries/sessions';
import type { ExerciseInSession, SetLog } from '../../db/schema';
import { confirmDialog } from '../../lib/confirm';
import { clockTime, duration, plural, relativeDay, tonnageLabel } from '../../lib/format';
import { fmtE1rm, fmtKg, e1rm, tonnage, weightStep } from '../../lib/strength';
import { c, font, radius, space } from '../../lib/theme';
import { useActiveSession } from '../../stores/activeSession';

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const session = useQuery(() => getSession(id), [id]);
  const view = useQuery(() => getSessionView(id), [id]);

  const expandedSlotId = useActiveSession((s) => s.expandedSlotId);
  const expand = useActiveSession((s) => s.expand);
  const startRest = useActiveSession((s) => s.startRest);
  const stopRest = useActiveSession((s) => s.stopRest);
  const prFlash = useActiveSession((s) => s.prFlash);
  const clearPr = useActiveSession((s) => s.clearPr);
  const resetSessionUi = useActiveSession((s) => s.reset);

  const [picking, setPicking] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // Premier exercice non terminé : c'est celui qu'on veut voir déplié à l'ouverture.
  useEffect(() => {
    if (expandedSlotId || !view.length) return;
    const next = view.find((e) => e.today.length < e.targetSets) ?? view[0];
    expand(next.slotId);
  }, [view, expandedSlotId, expand]);

  useEffect(() => {
    if (!session) return;
    const tick = () => setElapsed(Date.now() - Date.parse(session.startedAt));
    tick();
    const handle = setInterval(tick, 30_000);
    return () => clearInterval(handle);
  }, [session]);

  useEffect(() => {
    if (!prFlash) return;
    const handle = setTimeout(clearPr, 2600);
    return () => clearTimeout(handle);
  }, [prFlash, clearPr]);

  const totals = useMemo(() => {
    const sets = view.flatMap((e) => e.today);
    return {
      sets: sets.filter((s) => s.setType !== 'warmup').length,
      tonnage: tonnage(sets),
      prs: sets.filter((s) => s.isPr).length,
      done: view.filter((e) => e.today.length >= e.targetSets).length,
    };
  }, [view]);

  const finish = useCallback(() => {
    const close = () => {
      endSession(id);
      stopRest();
      resetSessionUi();
      router.replace(`/session/recap/${id}`);
    };
    if (totals.sets === 0) {
      confirmDialog(
        'Terminer sans aucune série ?',
        'La séance sera supprimée.',
        'Abandonner',
        () => {
          discardSession(id);
          stopRest();
          resetSessionUi();
          router.replace('/');
        },
      );
      return;
    }
    close();
  }, [id, router, stopRest, resetSessionUi, totals.sets]);

  if (!session) {
    return (
      <SafeAreaView style={styles.screen}>
        <Loading />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <IconButton
          name="chevron-down"
          accessibilityLabel="Réduire la séance"
          color={c.text}
          onPress={() => router.back()}
        />
        <View style={styles.headerText}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {session.routineName}
          </Text>
          <Text style={[styles.headerMeta, font.tabular]}>
            {clockTime(session.startedAt)} · {duration(Math.max(0, Math.round(elapsed / 60000)))} ·{' '}
            {plural(totals.sets, 'série')} · {tonnageLabel(totals.tonnage)}
          </Text>
        </View>
        <Button label="Terminer" onPress={finish} />
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {view.length === 0 ? (
          <EmptyState
            icon="barbell"
            title="Séance libre"
            body="Ajoute ton premier exercice — tu peux en ajouter d'autres au fil de la séance."
            action={<Button label="Ajouter un exercice" icon="add" onPress={() => setPicking(true)} />}
          />
        ) : (
          view.map((entry) => (
            <ExerciseBlock
              key={entry.slotId}
              sessionId={id}
              entry={entry}
              expanded={expandedSlotId === entry.slotId}
              onToggle={() => expand(expandedSlotId === entry.slotId ? null : entry.slotId)}
              onRested={(seconds) => startRest(seconds, entry.exercise.labelFr)}
              onOpenExercise={() => router.push(`/exercises/${entry.exercise.id}`)}
            />
          ))
        )}

        {view.length > 0 ? (
          <Button
            label="Ajouter un exercice"
            icon="add"
            variant="secondary"
            onPress={() => setPicking(true)}
          />
        ) : null}

        <Pressable onPress={() => confirmDiscard(id, () => {
          discardSession(id);
          stopRest();
          resetSessionUi();
          router.replace('/');
        })}>
          <Text style={styles.discard}>Abandonner cette séance</Text>
        </Pressable>
      </ScrollView>

      <View style={styles.footer}>
        <RestTimer />
      </View>

      {prFlash ? (
        <View style={styles.prBanner} pointerEvents="none">
          <Icon name="trophy" size={18} color={c.bg} />
          <Text style={styles.prBannerLabel}>
            Nouveau record — {fmtE1rm(prFlash.e1rm)} estimés
          </Text>
        </View>
      ) : null}

      <ExercisePicker
        visible={picking}
        onClose={() => setPicking(false)}
        alreadyIn={view.map((e) => e.exercise.id)}
        onPick={(exerciseId) => {
          const slotId = addExerciseToSession(id, exerciseId);
          expand(slotId);
          setPicking(false);
        }}
      />
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ *
 * Un exercice dans la séance
 * ------------------------------------------------------------------ */

type Draft = { weight: string; reps: string };

function ExerciseBlock({
  sessionId,
  entry,
  expanded,
  onToggle,
  onRested,
  onOpenExercise,
}: {
  sessionId: string;
  entry: ExerciseInSession;
  expanded: boolean;
  onToggle: () => void;
  onRested: (seconds: number) => void;
  onOpenExercise: () => void;
}) {
  const flashPr = useActiveSession((s) => s.flashPr);
  const step = weightStep(entry.exercise.equipment);

  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [pad, setPad] = useState<{ target: 'draft' | 'logged'; index: number; field: 'weight' | 'reps' } | null>(
    null,
  );
  /** Tampon d'édition d'une série déjà enregistrée : on n'écrit qu'à la
   *  fermeture du pavé, sinon chaque frappe déclencherait un recalcul de PR. */
  const [loggedDraft, setLoggedDraft] = useState<Draft | null>(null);

  const doneCount = entry.today.length;
  /** Lignes restant à valider pour atteindre la cible. */
  const pending = Math.max(0, entry.targetSets - doneCount);

  useEffect(() => {
    // On complète jusqu'à la cible sans jamais retirer une ligne ajoutée à la
    // main : validate() se charge de retirer celle qui vient d'être loggée.
    setDrafts((current) => {
      if (current.length >= pending) return current;
      const next = [...current];
      while (next.length < pending) next.push(prefill(doneCount + next.length, entry));
      return next;
    });
  }, [pending, doneCount, entry]);

  const patchDraft = (index: number, patch: Partial<Draft>) =>
    setDrafts((d) => d.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  function validate(index: number) {
    const draft = drafts[index];
    if (!draft) return;
    const weightKg = parseFr(draft.weight);
    const reps = Math.round(parseFr(draft.reps));
    if (reps <= 0) {
      setPad({ target: 'draft', index, field: 'reps' });
      return;
    }

    const result = logSet({ sessionId, exerciseId: entry.exercise.id, weightKg, reps });
    // Les lignes suivantes laissées vides héritent de ce qui vient d'être fait :
    // le cas nominal reste « appuyer sur ✓ sans rien saisir » (§5).
    setDrafts((d) =>
      d
        .filter((_, i) => i !== index)
        .map((row) =>
          row.weight === ''
            ? { weight: formatFr(weightKg), reps: row.reps || String(reps) }
            : row,
        ),
    );
    setPad(null);

    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(
        result.isPr ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light,
      );
    }
    if (result.isPr) {
      flashPr({
        exerciseId: entry.exercise.id,
        setId: result.set.id,
        e1rm: e1rm(weightKg, reps),
        at: Date.now(),
      });
    }
    // Valider une série démarre le repos : c'est le geste, pas un bouton à part.
    onRested(entry.restSeconds);
  }

  /** Ouvre le pavé sur une série déjà enregistrée. */
  function openLogged(index: number, field: 'weight' | 'reps') {
    const set = entry.today[index];
    if (!set) return;
    setLoggedDraft({ weight: formatFr(set.weightKg), reps: String(set.reps) });
    setPad({ target: 'logged', index, field });
  }

  function commitLogged() {
    if (!pad || pad.target !== 'logged' || !loggedDraft) return;
    const set = entry.today[pad.index];
    const reps = Math.round(parseFr(loggedDraft.reps));
    if (set && reps > 0) {
      updateSet(set.id, { weightKg: parseFr(loggedDraft.weight), reps });
    }
    setLoggedDraft(null);
  }

  function closePad() {
    if (pad?.target === 'logged') commitLogged();
    setPad(null);
  }

  const lastTimeLabel = entry.lastTime
    ? `${fmtKg(Math.max(...entry.lastTime.sets.map((s) => s.weightKg)))} kg × ${entry.lastTime.sets
        .map((s) => s.reps)
        .join(',')} · ${relativeDay(entry.lastTime.sessionDate)}`
    : 'Première fois sur cet exercice';

  const complete = doneCount >= entry.targetSets && entry.targetSets > 0;

  const padRequest: NumPadRequest | null = pad
    ? {
        key: `${entry.slotId}:${pad.target}:${pad.index}:${pad.field}`,
        title: entry.exercise.labelFr,
        subtitle:
          pad.target === 'draft'
            ? `Série ${doneCount + pad.index + 1}${entry.targetReps ? ` · cible ${entry.targetReps} reps` : ''}`
            : `Correction de la série ${pad.index + 1}`,
        field: pad.field,
        weight: pad.target === 'draft' ? (drafts[pad.index]?.weight ?? '') : (loggedDraft?.weight ?? ''),
        reps: pad.target === 'draft' ? (drafts[pad.index]?.reps ?? '') : (loggedDraft?.reps ?? ''),
        weightStep: step,
      }
    : null;

  return (
    <View style={[styles.block, expanded && styles.blockExpanded, complete && styles.blockDone]}>
      <Pressable onPress={onToggle} style={styles.blockHead}>
        <View style={styles.blockTitleWrap}>
          <Text style={styles.blockTitle} numberOfLines={2}>
            {entry.exercise.labelFr}
          </Text>
          <Text style={styles.blockSub} numberOfLines={1}>
            {lastTimeLabel}
          </Text>
        </View>
        <View style={styles.blockRight}>
          <Badge
            label={`${doneCount}/${entry.targetSets}`}
            tone={complete ? 'ok' : 'default'}
          />
          <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={18} />
        </View>
      </Pressable>

      {expanded ? (
        <View style={styles.blockBody}>
          <View style={setRowStyles.header}>
            <Text style={setRowStyles.headerIndex}>#</Text>
            <Text style={setRowStyles.headerPrevious}>PRÉCÉDENT</Text>
            <Text style={setRowStyles.headerCell}>KG</Text>
            <Text style={setRowStyles.headerCell}>REPS</Text>
            <View style={setRowStyles.headerCheck} />
          </View>

          {entry.today.map((set, i) => (
            <SetRow
              key={set.id}
              index={i + 1}
              previous={entry.lastTime?.sets[i] ?? null}
              weight={formatFr(set.weightKg)}
              reps={String(set.reps)}
              logged={set}
              setType={set.setType}
              onPressWeight={() => openLogged(i, 'weight')}
              onPressReps={() => openLogged(i, 'reps')}
              onValidate={() => openLogged(i, 'weight')}
              onLongPress={() => confirmDeleteSet(set, () => deleteSet(set.id))}
            />
          ))}

          {drafts.map((draft, i) => (
            <SetRow
              key={`draft-${i}`}
              index={doneCount + i + 1}
              previous={entry.lastTime?.sets[doneCount + i] ?? null}
              weight={draft.weight}
              reps={draft.reps}
              logged={null}
              setType="working"
              onPressWeight={() => setPad({ target: 'draft', index: i, field: 'weight' })}
              onPressReps={() => setPad({ target: 'draft', index: i, field: 'reps' })}
              onValidate={() => validate(i)}
              onLongPress={() => setDrafts((d) => d.filter((_, j) => j !== i))}
            />
          ))}

          <View style={styles.blockActions}>
            <Pressable
              onPress={() =>
                setDrafts((d) => [...d, d[d.length - 1] ?? prefill(doneCount + d.length, entry)])
              }
              style={({ pressed }) => [styles.addSet, pressed && { opacity: 0.6 }]}
            >
              <Icon name="add" size={16} color={c.textDim} />
              <Text style={styles.addSetLabel}>Ajouter une série</Text>
            </Pressable>

            <IconButton
              name="information-circle-outline"
              accessibilityLabel="Voir la fiche de l'exercice"
              onPress={onOpenExercise}
            />
            {entry.slotId.startsWith('orphan:') ? null : (
              <IconButton
                name="trash-outline"
                accessibilityLabel="Retirer de la séance"
                color="#FF7A63"
                onPress={() => removeExerciseFromSession(entry.slotId)}
              />
            )}
          </View>
        </View>
      ) : null}

      <NumPad
        request={padRequest}
        onChange={(patch) => {
          if (!pad) return;
          if (pad.target === 'draft') patchDraft(pad.index, patch);
          else setLoggedDraft((d) => ({ weight: '', reps: '', ...d, ...patch }));
        }}
        onValidate={() => {
          if (!pad) return;
          if (pad.target === 'draft') validate(pad.index);
          else closePad();
        }}
        onClose={closePad}
      />
    </View>
  );
}

/**
 * Valeur pré-remplie de la série n° `setIndex` (0-based) :
 * la série correspondante de la dernière fois, sinon la dernière série faite
 * aujourd'hui, sinon la dernière série de la dernière fois.
 */
function prefill(setIndex: number, entry: ExerciseInSession): Draft {
  const previous = entry.lastTime?.sets[setIndex];
  if (previous) return { weight: formatFr(previous.weightKg), reps: String(previous.reps) };

  const today = entry.today[entry.today.length - 1];
  if (today) return { weight: formatFr(today.weightKg), reps: String(today.reps) };

  const lastEver = entry.lastTime?.sets[entry.lastTime.sets.length - 1];
  if (lastEver) return { weight: formatFr(lastEver.weightKg), reps: String(lastEver.reps) };

  return { weight: '', reps: entry.targetReps?.split('-')[0] ?? '' };
}

/* ------------------------------------------------------------------ *
 * Confirmations
 * ------------------------------------------------------------------ */

const confirmDiscard = (_id: string, onConfirm: () => void) =>
  confirmDialog(
    'Abandonner la séance ?',
    'Toutes les séries enregistrées seront supprimées.',
    'Abandonner',
    onConfirm,
  );

const confirmDeleteSet = (set: SetLog, onConfirm: () => void) =>
  confirmDialog(
    'Supprimer cette série ?',
    `${fmtKg(set.weightKg)} kg × ${set.reps}`,
    'Supprimer',
    onConfirm,
  );

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  headerText: { flex: 1 },
  headerTitle: { color: c.text, fontSize: 17, fontWeight: '800' },
  headerMeta: { color: c.textFaint, fontSize: 12 },

  list: { padding: space.md, gap: space.sm, paddingBottom: space.xxl },

  block: {
    backgroundColor: c.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: c.border,
    overflow: 'hidden',
  },
  blockExpanded: { borderColor: c.borderStrong },
  blockDone: { borderColor: 'rgba(52,211,153,0.35)' },
  blockHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
  },
  blockTitleWrap: { flex: 1, gap: 2 },
  blockTitle: { color: c.text, fontSize: 16, fontWeight: '700' },
  blockSub: { color: c.textFaint, fontSize: 12 },
  blockRight: { flexDirection: 'row', alignItems: 'center', gap: space.sm },

  blockBody: {
    paddingHorizontal: space.md,
    paddingBottom: space.md,
    gap: 2,
    borderTopWidth: 1,
    borderTopColor: c.border,
    paddingTop: space.sm,
  },
  blockActions: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm },
  addSet: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: c.border,
  },
  addSetLabel: { color: c.textDim, fontSize: 13, fontWeight: '600' },

  footer: { paddingHorizontal: space.md, paddingBottom: space.sm },
  discard: {
    color: c.textFaint,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: space.lg,
    textDecorationLine: 'underline',
  },

  // Toast : ancré en bas, au-dessus du chrono. En haut il masquait le nom de
  // l'exercice qu'on est justement en train de lire.
  prBanner: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    bottom: 104,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    backgroundColor: c.accent,
    borderRadius: radius.pill,
    paddingVertical: space.md,
  },
  prBannerLabel: { color: c.bg, fontSize: 15, fontWeight: '800' },
});
