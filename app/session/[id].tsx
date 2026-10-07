import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '../../components/Text';
import { CardioSection, CardioTimerBar } from '../../components/Cardio';
import { ExercisePicker } from '../../components/ExercisePicker';
import { NumPad, formatFr, parseFr } from '../../components/NumPad';
import type { NumPadRequest } from '../../components/NumPad';
import { RestTimer } from '../../components/RestTimer';
import { SetRow, setRowStyles } from '../../components/SetRow';
import { Badge, Button, EmptyState, Icon, IconButton, Loading, ProgressRing } from '../../components/ui';
import { useQuery } from '../../db/client';
import { finishCardioTimer, getCardioTimer, getSessionCardio, saveCardioTimer } from '../../db/queries/cardio';
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
import { cardioDuration } from '../../lib/cardio';
import { confirmDialog } from '../../lib/confirm';
import { clockTime, duration, plural, relativeDay, tonnageLabel } from '../../lib/format';
import { fmtE1rm, fmtKg, e1rm, tonnage, weightStep } from '../../lib/strength';
import { c, font, radius, space, type } from '../../lib/theme';
import { useActiveSession } from '../../stores/activeSession';

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const wide = width >= 1000;

  const session = useQuery(() => getSession(id), [id]);
  const view = useQuery(() => getSessionView(id), [id]);
  const cardio = useQuery(() => getSessionCardio(id), [id]);
  const cardioSec = cardio.reduce((sum, e) => sum + e.durationSec, 0);
  const cardioRunning = useQuery(() => getCardioTimer()?.sessionId === id, [id]);

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
    // Terminer la séance pendant le cardio enregistre ce qui a été fait.
    if (cardioRunning) finishCardioTimer();
    const close = () => {
      endSession(id);
      stopRest();
      resetSessionUi();
      router.replace(`/session/recap/${id}`);
    };
    // Une séance 100 % cardio est une vraie séance : seule une séance vide part.
    if (totals.sets === 0 && cardio.length === 0 && !cardioRunning) {
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
  }, [id, router, stopRest, resetSessionUi, totals.sets, cardio.length, cardioRunning]);

  const targetSets = view.reduce((sum, entry) => sum + entry.targetSets, 0);
  const completedTargetSets = view.reduce((sum, entry) => sum + Math.min(entry.today.length, entry.targetSets), 0);
  const completion = targetSets ? completedTargetSets / targetSets : 0;

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
        <View style={styles.headerInner}>
        <IconButton
          name="chevron-down"
          accessibilityLabel="Réduire la séance"
          color={c.text}
          onPress={() => router.back()}
        />
        <View style={styles.headerText}>
          <View style={styles.liveLabel}><View style={styles.liveDot} /><Text style={styles.headerTitle}>MODE SÉANCE</Text></View>
          <Text style={[styles.headerMeta, font.tabular]}>
            Depuis {clockTime(session.startedAt)} · {duration(Math.max(0, Math.round(elapsed / 60000)))}
          </Text>
        </View>
        <Button label="Terminer" icon="checkmark" onPress={finish} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.sessionHeading}>
          <Text style={styles.eyebrow}>CHAQUE SÉRIE COMPTE.</Text>
          <Text style={[styles.sessionTitle, wide && styles.sessionTitleWide]}>{session.routineName}</Text>
          <View style={styles.sessionMeta}>
            <Badge label={`${totals.done}/${view.length} exercices`} />
            <Badge label={`${plural(totals.sets, 'série')} validée${totals.sets === 1 ? '' : 's'}`} tone="accent" />
            <Badge label={tonnageLabel(totals.tonnage)} />
            {cardioSec > 0 ? <Badge label={`${cardioDuration(cardioSec)} de cardio`} icon="heart-outline" /> : null}
          </View>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.min(100, completion * 100)}%` }]} /></View>
        </View>
        <View style={[styles.workspace, wide && styles.workspaceWide]}>
        <View style={styles.list}>
        {view.length === 0 ? (
          <EmptyState
            icon="barbell"
            title="Séance libre"
            body="Ajoute ton premier exercice — tu peux en ajouter d'autres au fil de la séance. Pas de muscu aujourd'hui ? Le cardio est juste en dessous."
            action={<Button label="Ajouter un exercice" icon="add" onPress={() => setPicking(true)} />}
          />
        ) : (
          view.map((entry, index) => (
            <ExerciseBlock
              key={entry.slotId}
              index={index + 1}
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

        <CardioSection sessionId={id} />

        <Pressable accessibilityRole="button" onPress={() => confirmDiscard(id, () => {
          if (getCardioTimer()?.sessionId === id) saveCardioTimer(null);
          discardSession(id);
          stopRest();
          resetSessionUi();
          router.replace('/');
        })}>
          <Text style={styles.discard}>Abandonner cette séance</Text>
        </Pressable>
        </View>
        {wide ? (
          <View style={styles.sidebar}>
            <View style={styles.focusCard}>
              <Text style={styles.eyebrow}>TON AVANCÉE</Text>
              <View style={styles.ringWrap}>
                <ProgressRing progress={completion} size={132} stroke={8} color={c.accent}>
                  <Text style={styles.ringValue}>{Math.round(completion * 100)}<Text style={styles.ringUnit}>%</Text></Text>
                  <Text style={styles.ringCaption}>de ton programme</Text>
                </ProgressRing>
              </View>
              <View style={styles.sideStats}>
                <View><Text style={styles.sideStatValue}>{totals.sets}</Text><Text style={styles.sideStatLabel}>séries validées</Text></View>
                <View><Text style={styles.sideStatValue}>{tonnageLabel(totals.tonnage)}</Text><Text style={styles.sideStatLabel}>soulevés</Text></View>
              </View>
            </View>
            <View style={styles.focusCard}>
              <View style={styles.tipHead}><Icon name="flash-outline" size={19} color={c.accent} /><Text style={styles.tipTitle}>Un geste. Une série.</Text></View>
              <Text style={styles.tipBody}>Tes dernières charges sont déjà prêtes. Ajuste si besoin, puis coche ta série : ton repos démarre automatiquement.</Text>
              <View style={styles.savedHint}><Icon name="checkmark-circle-outline" size={16} color={c.ok} /><Text style={styles.savedText}>Chaque série est enregistrée sur cet appareil.</Text></View>
            </View>
          </View>
        ) : null}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {cardioRunning ? <CardioTimerBar sessionId={id} /> : <RestTimer />}
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
  index,
  sessionId,
  entry,
  expanded,
  onToggle,
  onRested,
  onOpenExercise,
}: {
  index: number;
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
      <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={onToggle} style={styles.blockHead}>
        <View style={[styles.exerciseNumber, complete && styles.exerciseNumberDone]}>
          {complete ? <Icon name="checkmark" size={19} color={c.ok} /> : <Text style={styles.exerciseNumberText}>{String(index).padStart(2, '0')}</Text>}
        </View>
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
          <View style={styles.exerciseGuide}>
            <View style={styles.exerciseGuideItem}><Icon name="layers-outline" size={14} color={c.accent} /><Text style={styles.exerciseGuideText}>{plural(entry.targetSets, 'série')}{entry.targetReps ? ` · ${entry.targetReps} reps` : ''}</Text></View>
            <View style={styles.exerciseGuideItem}><Icon name="timer-outline" size={14} color={c.textDim} /><Text style={styles.exerciseGuideText}>{entry.restSeconds} s de repos</Text></View>
          </View>
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
                color={c.danger}
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
    'Toutes les séries et le cardio enregistrés seront supprimés.',
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
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    backgroundColor: c.surface,
  },
  headerInner: { width: '100%', maxWidth: 1240, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md },
  headerText: { flex: 1 },
  headerTitle: { color: c.text, fontSize: 10, letterSpacing: 1.5, fontWeight: '800' },
  headerMeta: { color: c.textDim, fontSize: 12, marginTop: 5 },
  liveLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.accent },

  scrollContent: { width: '100%', maxWidth: 1240, alignSelf: 'center', padding: space.lg, paddingBottom: space.xxl, gap: space.xl },
  sessionHeading: { gap: space.md, paddingTop: space.md },
  eyebrow: { ...type.overline, color: c.accent, fontSize: 10, letterSpacing: 1.8 },
  sessionTitle: { ...font.display, fontSize: 44, lineHeight: 48, color: c.text },
  sessionTitleWide: { fontSize: 64, lineHeight: 68 },
  sessionMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  progressTrack: { height: 4, backgroundColor: c.surfaceHigh, borderRadius: radius.pill, marginTop: space.sm, overflow: 'hidden' },
  progressFill: { height: 4, backgroundColor: c.accent, borderRadius: radius.pill },
  workspace: { gap: space.xl },
  workspaceWide: { flexDirection: 'row', alignItems: 'flex-start' },
  list: { flex: 1, gap: space.md, minWidth: 0 },
  sidebar: { width: 288, gap: space.lg },
  focusCard: { padding: space.xl, borderRadius: radius.xl, backgroundColor: c.surface, gap: space.md, borderWidth: 1, borderColor: c.border },
  ringWrap: { alignItems: 'center', paddingVertical: space.sm },
  ringValue: { ...font.display, color: c.text, fontSize: 42, lineHeight: 46 },
  ringUnit: { ...font.display, color: c.accent, fontSize: 24 },
  ringCaption: { color: c.textFaint, fontSize: 9 },
  sideStats: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md, paddingTop: space.md, borderTopWidth: 1, borderTopColor: c.border },
  sideStatValue: { ...font.display, color: c.text, fontSize: 30 },
  sideStatLabel: { color: c.textFaint, fontSize: 11 },
  tipHead: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  tipTitle: { color: c.text, fontSize: 14, fontWeight: '700' },
  tipBody: { color: c.textDim, fontSize: 12, lineHeight: 20 },
  savedHint: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingTop: space.md, borderTopWidth: 1, borderTopColor: c.border },
  savedText: { color: c.textFaint, flex: 1, fontSize: 10, lineHeight: 16 },

  block: {
    backgroundColor: c.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: c.border,
    overflow: 'hidden',
  },
  blockExpanded: { borderColor: c.accent },
  blockDone: { borderColor: c.okDim },
  blockHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
  },
  blockTitleWrap: { flex: 1, gap: 2 },
  exerciseNumber: { width: 34, height: 38, borderRadius: radius.sm, backgroundColor: c.surfaceAlt, justifyContent: 'center', alignItems: 'center' },
  exerciseNumberDone: { backgroundColor: c.okDim },
  exerciseNumberText: { ...font.display, fontSize: 22, color: c.textDim },
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
  exerciseGuide: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, paddingVertical: space.md, marginBottom: space.sm },
  exerciseGuideItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  exerciseGuideText: { color: c.textDim, fontSize: 11 },
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

  footer: { width: '100%', maxWidth: 1240, alignSelf: 'center', paddingHorizontal: space.lg, paddingBottom: space.sm },
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
