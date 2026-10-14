import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from './Text';
import { BodyMap, highlightsFromRoles } from './BodyMap/BodyMap';
import { CardioSection, CardioTimerBar } from './Cardio';
import { NumPad, formatFr, parseFr } from './NumPad';
import { RestTimer } from './RestTimer';
import { Badge, Button, EmptyState, Icon } from './ui';
import type { IconName } from './ui';
import { lastWorkingSets, progressionHint, useExerciseSets } from './useExerciseSets';
import { useQuery } from '../db/client';
import { musclesOf } from '../db/queries/exercises';
import { deleteSet, removeExerciseFromSession } from '../db/queries/sessions';
import type { ExerciseInSession, Muscle, MuscleRole, SetLog } from '../db/schema';
import { confirmDialog } from '../lib/confirm';
import { EQUIPMENT_LABEL, plural, relativeDay, tonnageLabel } from '../lib/format';
import { bestSet, e1rm, fmtE1rm, fmtKg, isWorkingSet, tonnage } from '../lib/strength';
import { c, font, radius, space, type } from '../lib/theme';

/** Identifiant de l'étape cardio dans le rail, à côté des `slotId` des exercices. */
export const CARDIO_STEP = 'cardio';

type FocusViewProps = {
  sessionId: string;
  routineName: string;
  view: ExerciseInSession[];
  /** `slotId` de l'exercice affiché, ou `CARDIO_STEP`. */
  currentId: string | null;
  onSelect: (id: string) => void;
  onAddExercise: () => void;
  onOpenExercise: (exerciseId: string) => void;
  onRested: (seconds: number, exerciseLabel: string) => void;
  onFinish: () => void;
  onDiscard: () => void;
  cardioCount: number;
  cardioRunning: boolean;
  wide: boolean;
};

/**
 * Mode Focus : un exercice à la fois, comme on le vit à la salle.
 *
 * L'écran répond à trois questions, dans cet ordre : qu'est-ce que je fais
 * maintenant (la série en cours, en grand), combien je mets (la dernière fois,
 * et la proposition de progression), et qu'est-ce qui vient après. Le bouton
 * principal est en bas, sous le pouce, avec le chrono de repos juste au-dessus.
 */
export function FocusView(props: FocusViewProps) {
  const { view, currentId, onSelect, wide } = props;
  const ids = view.map((e) => e.exercise.id).join(',');
  const muscles = useQuery(() => musclesOf(ids ? ids.split(',') : []), [ids]);

  const onCardio = currentId === CARDIO_STEP || view.length === 0;
  // Avant que l'écran ait choisi l'exercice courant (premier rendu, exercice
  // retiré), on montre le premier exercice pas encore terminé.
  const found = view.findIndex((e) => e.slotId === currentId);
  const index =
    found !== -1
      ? found
      : Math.max(0, view.findIndex((e) => e.today.filter(isWorkingSet).length < e.targetSets));
  const entry = onCardio ? null : view[index];

  const top = (
    <>
      <SessionHeading routineName={props.routineName} view={view} />
      <StepRail
        view={view}
        currentId={onCardio ? CARDIO_STEP : (view[index]?.slotId ?? null)}
        cardioDone={props.cardioCount > 0}
        onSelect={onSelect}
        onAdd={props.onAddExercise}
      />
    </>
  );
  const aside = wide && view.length ? <ProgramAside view={view} currentId={currentId} onSelect={onSelect} /> : null;

  if (!entry) {
    return (
      <FocusLayout
        top={top}
        aside={aside}
        wide={wide}
        footer={
          props.cardioRunning ? (
            <CardioTimerBar sessionId={props.sessionId} />
          ) : (
            <>
              <RestTimer showIdle={false} />
              <Button label="Terminer la séance" icon="flag-outline" size="lg" onPress={props.onFinish} />
            </>
          )
        }
      >
        {view.length === 0 ? (
          <EmptyState
            icon="barbell"
            title="Séance libre"
            body="Ajoute ton premier exercice — tu peux en ajouter d'autres au fil de la séance. Pas de muscu aujourd'hui ? Le cardio est juste en dessous."
            action={<Button label="Ajouter un exercice" icon="add" onPress={props.onAddExercise} />}
          />
        ) : null}
        <CardioSection sessionId={props.sessionId} />
        <Pressable accessibilityRole="button" onPress={props.onDiscard}>
          <Text style={s.discard}>Abandonner cette séance</Text>
        </Pressable>
      </FocusLayout>
    );
  }

  const next = view[index + 1] ?? null;
  return (
    <FocusExercise
      // Changer d'exercice repart de brouillons frais, pré-remplis pour celui-ci.
      key={entry.slotId}
      sessionId={props.sessionId}
      entry={entry}
      position={index + 1}
      total={view.length}
      muscles={muscles.get(entry.exercise.id) ?? []}
      next={next}
      top={top}
      aside={aside}
      wide={wide}
      onPrev={index > 0 ? () => onSelect(view[index - 1].slotId) : null}
      onNext={() => onSelect(next ? next.slotId : CARDIO_STEP)}
      onRested={(seconds) => props.onRested(seconds, entry.exercise.labelFr)}
      onOpenExercise={() => props.onOpenExercise(entry.exercise.id)}
    />
  );
}

/* ------------------------------------------------------------------ *
 * Mise en page : contenu défilant + barre d'action collée en bas
 * ------------------------------------------------------------------ */

function FocusLayout({
  top,
  aside,
  wide,
  footer,
  children,
}: {
  top: ReactNode;
  aside: ReactNode;
  wide: boolean;
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <View style={s.flex}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {top}
        <View style={[s.workspace, wide && s.workspaceWide]}>
          <View style={s.main}>{children}</View>
          {aside}
        </View>
      </ScrollView>
      <View style={s.footer}>
        <View style={s.footerInner}>{footer}</View>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * En-tête et rail des étapes
 * ------------------------------------------------------------------ */

function SessionHeading({ routineName, view }: { routineName: string; view: ExerciseInSession[] }) {
  const sets = view.flatMap((e) => e.today);
  const working = sets.filter(isWorkingSet).length;
  const done = view.filter((e) => e.targetSets > 0 && e.today.filter(isWorkingSet).length >= e.targetSets).length;
  return (
    <View style={s.heading}>
      <Text style={s.routine} numberOfLines={1}>{routineName}</Text>
      <Text style={[s.headingMeta, font.tabular]}>
        {view.length ? `${done}/${view.length} exercices · ` : ''}
        {plural(working, 'série')} · {tonnageLabel(tonnage(sets))}
      </Text>
    </View>
  );
}

function StepRail({
  view,
  currentId,
  cardioDone,
  onSelect,
  onAdd,
}: {
  view: ExerciseInSession[];
  currentId: string | null;
  cardioDone: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.rail}>
      {view.map((entry, i) => {
        const done = entry.today.filter(isWorkingSet).length;
        const progress = entry.targetSets ? Math.min(1, done / entry.targetSets) : 0;
        return (
          <RailPill
            key={entry.slotId}
            label={String(i + 1)}
            accessibilityLabel={`${entry.exercise.labelFr}, ${done} sur ${entry.targetSets} séries`}
            active={entry.slotId === currentId}
            done={progress >= 1}
            progress={progress}
            onPress={() => onSelect(entry.slotId)}
          />
        );
      })}
      <RailPill
        icon="heart"
        accessibilityLabel="Cardio et fin de séance"
        active={currentId === CARDIO_STEP}
        done={cardioDone}
        progress={cardioDone ? 1 : 0}
        onPress={() => onSelect(CARDIO_STEP)}
      />
      <Pressable accessibilityRole="button" accessibilityLabel="Ajouter un exercice" onPress={onAdd} style={({ pressed }) => [s.pill, s.pillAdd, pressed && s.pressed]}>
        <Icon name="add" size={18} color={c.textDim} />
      </Pressable>
    </ScrollView>
  );
}

function RailPill({
  label,
  icon,
  accessibilityLabel,
  active,
  done,
  progress,
  onPress,
}: {
  label?: string;
  icon?: IconName;
  accessibilityLabel: string;
  active: boolean;
  done: boolean;
  progress: number;
  onPress: () => void;
}) {
  const fg = active ? c.onAccent : done ? c.ok : c.textDim;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [s.pill, done && s.pillDone, active && s.pillActive, pressed && s.pressed]}
    >
      {done && !active ? (
        <Icon name="checkmark" size={18} color={c.ok} />
      ) : icon ? (
        <Icon name={icon} size={16} color={fg} />
      ) : (
        <Text style={[s.pillLabel, { color: fg }]}>{label}</Text>
      )}
      {progress > 0 && progress < 1 ? (
        <View style={s.pillTrack}>
          <View style={[s.pillFill, { width: `${progress * 100}%` }, active && { backgroundColor: c.onAccent }]} />
        </View>
      ) : null}
    </Pressable>
  );
}

/** Grand écran : le programme reste visible à côté de l'exercice en cours. */
function ProgramAside({
  view,
  currentId,
  onSelect,
}: {
  view: ExerciseInSession[];
  currentId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <View style={s.aside}>
      <Text style={s.overline}>AU PROGRAMME</Text>
      {view.map((entry, i) => {
        const done = entry.today.filter(isWorkingSet).length;
        const complete = entry.targetSets > 0 && done >= entry.targetSets;
        const active = entry.slotId === currentId;
        return (
          <Pressable
            key={entry.slotId}
            accessibilityRole="button"
            onPress={() => onSelect(entry.slotId)}
            style={({ pressed }) => [s.asideRow, active && s.asideRowActive, pressed && s.pressed]}
          >
            <View style={[s.asideNum, complete && s.asideNumDone]}>
              {complete ? <Icon name="checkmark" size={14} color={c.ok} /> : <Text style={s.asideNumLabel}>{i + 1}</Text>}
            </View>
            <Text style={[s.asideName, active && { color: c.text }]} numberOfLines={1}>{entry.exercise.labelFr}</Text>
            <Text style={[s.asideCount, font.tabular]}>{done}/{entry.targetSets}</Text>
          </Pressable>
        );
      })}
      <Pressable accessibilityRole="button" onPress={() => onSelect(CARDIO_STEP)} style={({ pressed }) => [s.asideRow, currentId === CARDIO_STEP && s.asideRowActive, pressed && s.pressed]}>
        <View style={s.asideNum}><Icon name="heart" size={13} color={c.textDim} /></View>
        <Text style={s.asideName}>Cardio et fin de séance</Text>
      </Pressable>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * L'exercice en cours
 * ------------------------------------------------------------------ */

function FocusExercise({
  sessionId,
  entry,
  position,
  total,
  muscles,
  next,
  top,
  aside,
  wide,
  onPrev,
  onNext,
  onRested,
  onOpenExercise,
}: {
  sessionId: string;
  entry: ExerciseInSession;
  position: number;
  total: number;
  muscles: { muscle: Muscle; role: MuscleRole }[];
  next: ExerciseInSession | null;
  top: ReactNode;
  aside: ReactNode;
  wide: boolean;
  onPrev: (() => void) | null;
  onNext: () => void;
  onRested: (seconds: number) => void;
  onOpenExercise: () => void;
}) {
  const sets = useExerciseSets(sessionId, entry, onRested);
  const draft = sets.drafts[0] ?? null;
  const number = draft ? sets.draftNumber(0) : 0;
  const last = lastWorkingSets(entry);
  /** La série de la dernière fois qui correspond à celle qu'on s'apprête à faire. */
  const matching = draft && !draft.warmup ? (last[sets.workingDone] ?? null) : null;
  const hint = draft ? progressionHint(entry, sets.workingDone, draft, sets.step) : null;

  const nextLabel = next ? `Suivant : ${next.exercise.labelFr}` : 'Passer au cardio';

  let footerAction: ReactNode;
  if (sets.complete) {
    footerAction = <Button label={nextLabel} icon="arrow-forward" size="lg" onPress={onNext} />;
  } else if (draft) {
    footerAction = (
      <Button
        label={draft.warmup ? "Valider l'échauffement" : `Valider la série ${number}`}
        icon="checkmark"
        size="lg"
        onPress={() => sets.validate(0)}
      />
    );
  } else {
    footerAction = <Button label="Ajouter une série" icon="add" size="lg" onPress={sets.addDraft} />;
  }

  const title = !draft
    ? ''
    : draft.warmup
      ? 'ÉCHAUFFEMENT'
      : number > entry.targetSets
        ? `SÉRIE ${number} · EN PLUS`
        : `SÉRIE ${number} SUR ${entry.targetSets}`;

  return (
    <FocusLayout
      top={top}
      aside={aside}
      wide={wide}
      footer={
        <>
          <RestTimer showIdle={false} />
          {footerAction}
        </>
      }
    >
      {/* Ce qu'on fait */}
      <View style={s.exCard}>
        <View style={s.exHead}>
          <View style={s.flex}>
            <Text style={s.overline}>
              EXERCICE {position} SUR {total}
              {EQUIPMENT_LABEL[entry.exercise.equipment] ? ` · ${EQUIPMENT_LABEL[entry.exercise.equipment].toUpperCase()}` : ''}
            </Text>
            <Pressable accessibilityRole="button" accessibilityHint="Ouvre la fiche de l'exercice" onPress={onOpenExercise}>
              <Text style={s.exTitle}>{entry.exercise.labelFr}</Text>
            </Pressable>
            <View style={s.targetRow}>
              <View style={s.targetItem}>
                <Icon name="layers-outline" size={14} color={c.accent} />
                <Text style={s.targetText}>
                  {entry.targetSets} × {entry.targetReps ?? '—'} reps
                </Text>
              </View>
              <View style={s.targetItem}>
                <Icon name="timer-outline" size={14} color={c.textDim} />
                <Text style={s.targetText}>{restLabel(entry.restSeconds)} de repos</Text>
              </View>
            </View>
          </View>
          {muscles.length ? (
            <View pointerEvents="none">
              <BodyMap highlights={highlightsFromRoles(muscles)} size={40} />
            </View>
          ) : null}
        </View>

        <View style={s.lastTime}>
          <Text style={s.lastTimeLabel}>
            {entry.lastTime ? `DERNIÈRE FOIS · ${relativeDay(entry.lastTime.sessionDate).toUpperCase()}` : 'PREMIÈRE FOIS'}
          </Text>
          {last.length ? (
            <View style={s.lastChips}>
              {last.map((set, i) => (
                <View key={set.id} style={[s.lastChip, i === sets.workingDone && draft && !draft.warmup && s.lastChipActive]}>
                  <Text style={[s.lastChipText, font.tabular]}>{fmtKg(set.weightKg)} × {set.reps}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={s.lastTimeEmpty}>Choisis une charge que tu maîtrises : elle servira de base la prochaine fois.</Text>
          )}
        </View>
      </View>

      {/* Ce qu'on s'apprête à faire, ou le bilan de l'exercice */}
      {sets.complete ? (
        <DoneCard entry={entry} next={next} onAddSet={sets.addDraft} />
      ) : draft ? (
        <View style={[s.setCard, draft.warmup && s.setCardWarmup]}>
          <View style={s.setHead}>
            <Text style={[s.overline, { color: draft.warmup ? c.warn : c.accent }]}>{title}</Text>
            {draft.warmup ? (
              <Pressable accessibilityRole="button" onPress={() => sets.removeDraft(0)} hitSlop={8}>
                <Text style={s.linkDim}>Retirer</Text>
              </Pressable>
            ) : null}
          </View>

          <Stepper
            label="KG"
            value={draft.weight}
            step={sets.step}
            decimals
            onChange={(weight) => sets.patchDraft(0, { weight })}
            onPress={() => sets.openDraft(0, 'weight')}
          />
          <Stepper
            label="REPS"
            value={draft.reps}
            step={1}
            onChange={(reps) => sets.patchDraft(0, { reps })}
            onPress={() => sets.openDraft(0, 'reps')}
          />

          {hint ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => sets.patchDraft(0, { weight: formatFr(hint.weightKg) })}
              style={({ pressed }) => [s.hint, pressed && s.pressed]}
            >
              <Icon name="trending-up" size={18} color={c.pr} />
              <View style={s.flex}>
                <Text style={s.hintTitle}>{hint.title}</Text>
                <Text style={s.hintText}>{hint.detail}</Text>
              </View>
              <Text style={s.hintAction}>Appliquer</Text>
            </Pressable>
          ) : matching ? (
            <Text style={[s.matching, font.tabular]}>
              Dernière fois à cette série : {fmtKg(matching.weightKg)} kg × {matching.reps}
            </Text>
          ) : null}

          <View style={s.setTools}>
            {sets.workingDone === 0 && !draft.warmup ? (
              <ToolButton icon="flame-outline" label="Échauffement" onPress={sets.addWarmup} />
            ) : null}
            <ToolButton
              icon="play-skip-forward"
              label={draft.warmup ? "Passer l'échauffement" : 'Passer cette série'}
              onPress={() => sets.removeDraft(0)}
            />
          </View>
        </View>
      ) : null}

      {/* Ce qui est fait, et ce qui reste */}
      {entry.today.length || sets.drafts.length > 1 ? (
        <View style={s.setsList}>
          <Text style={s.overline}>TES SÉRIES</Text>
          {entry.today.map((set, i) => (
            <LoggedRow
              key={set.id}
              set={set}
              number={entry.today.slice(0, i + 1).filter(isWorkingSet).length}
              onPress={() => sets.openLogged(i, 'weight')}
              onLongPress={() => confirmDeleteSet(set)}
            />
          ))}
          {sets.drafts.slice(1).map((row, i) => (
            <Pressable
              key={`draft-${i}`}
              accessibilityRole="button"
              accessibilityHint="Appui long pour retirer cette série"
              onPress={() => sets.openDraft(i + 1, 'weight')}
              onLongPress={() => sets.removeDraft(i + 1)}
              style={({ pressed }) => [s.setRow, s.setRowPending, pressed && s.pressed]}
            >
              <Text style={[s.setNum, row.warmup && { color: c.warn }]}>{row.warmup ? 'É' : sets.draftNumber(i + 1)}</Text>
              <Text style={[s.setValue, s.setValuePending, font.tabular]}>
                {row.weight || '—'} kg × {row.reps || '—'}
              </Text>
              <Text style={s.setMeta}>à venir</Text>
            </Pressable>
          ))}
          {!sets.complete ? (
            <Pressable accessibilityRole="button" onPress={sets.addDraft} style={({ pressed }) => [s.addSet, pressed && s.pressed]}>
              <Icon name="add" size={16} color={c.textDim} />
              <Text style={s.linkDim}>Ajouter une série</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* Navigation entre exercices */}
      <View style={s.nav}>
        <NavButton icon="chevron-back" label="Précédent" disabled={!onPrev} onPress={() => onPrev?.()} />
        <View style={s.navTools}>
          <Pressable accessibilityRole="button" accessibilityLabel="Voir la fiche de l'exercice" onPress={onOpenExercise} hitSlop={8} style={s.navIcon}>
            <Icon name="information-circle-outline" size={20} />
          </Pressable>
          {entry.slotId.startsWith('orphan:') ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retirer de la séance"
              onPress={() => confirmRemove(entry, () => removeExerciseFromSession(entry.slotId))}
              hitSlop={8}
              style={s.navIcon}
            >
              <Icon name="trash-outline" size={19} color={c.danger} />
            </Pressable>
          )}
        </View>
        <NavButton icon="chevron-forward" label={next ? 'Suivant' : 'Cardio'} trailing onPress={onNext} />
      </View>

      {next && !sets.complete ? (
        <Pressable accessibilityRole="button" onPress={onNext} style={({ pressed }) => [s.upNext, pressed && s.pressed]}>
          <Text style={s.overline}>À SUIVRE</Text>
          <Text style={s.upNextName} numberOfLines={1}>{next.exercise.labelFr}</Text>
          <Text style={s.upNextMeta}>
            {next.targetSets} × {next.targetReps ?? '—'}
            {lastWorkingSets(next)[0] ? ` · ${fmtKg(lastWorkingSets(next)[0].weightKg)} kg la dernière fois` : ''}
          </Text>
        </Pressable>
      ) : null}

      <NumPad {...sets.numPad} />
    </FocusLayout>
  );
}

/** Bilan d'un exercice terminé : on ne compare que si c'est positif. */
function DoneCard({ entry, next, onAddSet }: { entry: ExerciseInSession; next: ExerciseInSession | null; onAddSet: () => void }) {
  const working = entry.today.filter(isWorkingSet);
  const best = bestSet(working);
  const bestToday = best ? e1rm(best.weightKg, best.reps) : 0;
  const bestBefore = Math.max(0, ...lastWorkingSets(entry).map((set) => e1rm(set.weightKg, set.reps)));
  const gain = bestBefore > 0 ? bestToday - bestBefore : 0;
  const prs = working.filter((set) => set.isPr).length;

  return (
    <View style={s.doneCard}>
      <View style={s.doneIcon}>
        <Icon name="checkmark" size={30} color={c.ok} />
      </View>
      <Text style={s.doneTitle}>Exercice terminé</Text>
      <Text style={[s.doneMeta, font.tabular]}>
        {plural(working.length, 'série')} · {tonnageLabel(tonnage(working))}
        {best ? ` · meilleure ${fmtKg(best.weightKg)} kg × ${best.reps}` : ''}
      </Text>
      <View style={s.doneBadges}>
        {prs ? <Badge label="Nouveau record" tone="pr" icon="trophy" /> : null}
        {gain >= 0.5 ? <Badge label={`+${fmtE1rm(gain)} de 1RM estimé`} tone="ok" icon="trending-up" /> : null}
      </View>
      <Text style={s.doneNext}>
        {next ? `Prochain : ${next.exercise.labelFr}. Prends ton repos, puis enchaîne.` : 'Dernier exercice de muscu. Cardio ou fin de séance ?'}
      </Text>
      <Button label="Ajouter une série" icon="add" variant="secondary" onPress={onAddSet} />
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Briques
 * ------------------------------------------------------------------ */

/**
 * Valeur ± en un geste : la plupart des ajustements entre deux séries sont
 * d'un cran (+2,5 kg, −1 rep). Le pavé reste à un appui sur le chiffre.
 */
function Stepper({
  label,
  value,
  step,
  decimals = false,
  onChange,
  onPress,
}: {
  label: string;
  value: string;
  step: number;
  decimals?: boolean;
  onChange: (next: string) => void;
  onPress: () => void;
}) {
  const bump = (delta: number) => {
    if (Platform.OS !== 'web') void Haptics.selectionAsync();
    const n = Math.max(0, Math.round((parseFr(value) + delta) * 100) / 100);
    onChange(decimals ? formatFr(n) : String(Math.round(n)));
  };
  const unit = label.toLowerCase();
  return (
    <View style={s.stepper}>
      <Text style={s.stepperLabel}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Moins ${formatFr(step)} ${unit}`}
        onPress={() => bump(-step)}
        style={({ pressed }) => [s.stepBtn, pressed && s.stepBtnPressed]}
      >
        <Icon name="remove" size={24} color={c.text} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${unit} : ${value || 'vide'}, toucher pour saisir`}
        onPress={onPress}
        style={({ pressed }) => [s.stepValueWrap, pressed && s.pressed]}
      >
        <Text style={[s.stepValue, font.tabular, !value && { color: c.textFaint }]} numberOfLines={1} adjustsFontSizeToFit>
          {value || '—'}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Plus ${formatFr(step)} ${unit}`}
        onPress={() => bump(step)}
        style={({ pressed }) => [s.stepBtn, pressed && s.stepBtnPressed]}
      >
        <Icon name="add" size={24} color={c.text} />
      </Pressable>
    </View>
  );
}

function LoggedRow({
  set,
  number,
  onPress,
  onLongPress,
}: {
  set: SetLog;
  number: number;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const warmup = !isWorkingSet(set);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Toucher pour corriger, appui long pour supprimer"
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [s.setRow, pressed && s.pressed]}
    >
      <View style={[s.setCheck, warmup && s.setCheckWarmup]}>
        {warmup ? <Text style={s.setCheckLabel}>É</Text> : <Text style={[s.setCheckLabel, { color: c.ok }]}>{number}</Text>}
      </View>
      <Text style={[s.setValue, font.tabular]}>
        {fmtKg(set.weightKg)} kg × {set.reps}
      </Text>
      {set.isPr ? <Badge label="PR" tone="pr" icon="trophy" /> : null}
      <Text style={[s.setMeta, font.tabular]}>{warmup ? 'échauffement' : `1RM ${fmtE1rm(e1rm(set.weightKg, set.reps))}`}</Text>
    </Pressable>
  );
}

function ToolButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [s.tool, pressed && s.pressed]}>
      <Icon name={icon} size={15} color={c.textDim} />
      <Text style={s.toolLabel}>{label}</Text>
    </Pressable>
  );
}

function NavButton({
  icon,
  label,
  trailing = false,
  disabled = false,
  onPress,
}: {
  icon: IconName;
  label: string;
  trailing?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const color = disabled ? c.border : c.textDim;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [s.navBtn, pressed && s.pressed]}
    >
      {trailing ? null : <Icon name={icon} size={18} color={color} />}
      <Text style={[s.navLabel, { color }]}>{label}</Text>
      {trailing ? <Icon name={icon} size={18} color={color} /> : null}
    </Pressable>
  );
}

function restLabel(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return sec ? `${min} min ${String(sec).padStart(2, '0')}` : `${min} min`;
}

const confirmDeleteSet = (set: SetLog) =>
  confirmDialog('Supprimer cette série ?', `${fmtKg(set.weightKg)} kg × ${set.reps}`, 'Supprimer', () => deleteSet(set.id));

const confirmRemove = (entry: ExerciseInSession, onConfirm: () => void) => {
  // Retirer un exercice sans série ne perd rien : pas de question inutile.
  if (!entry.today.length) return onConfirm();
  confirmDialog(
    'Retirer cet exercice ?',
    `${entry.exercise.labelFr} sort de la liste. Ses séries déjà faites restent dans la séance.`,
    'Retirer',
    onConfirm,
  );
};

const s = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.6 },
  scroll: { width: '100%', maxWidth: 1080, alignSelf: 'center', padding: space.lg, paddingBottom: space.xxl, gap: space.lg },
  workspace: { gap: space.lg },
  workspaceWide: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xl },
  main: { flex: 1, minWidth: 0, gap: space.md },
  overline: { ...type.overline, fontSize: 10, letterSpacing: 1.5 },

  footer: { borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.bg },
  footerInner: { width: '100%', maxWidth: 1080, alignSelf: 'center', paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm, gap: space.sm },

  heading: { gap: 4 },
  routine: { ...font.display, fontSize: 30, lineHeight: 34, color: c.text },
  headingMeta: { color: c.textFaint, fontSize: 12 },

  rail: { gap: space.sm, paddingVertical: 2 },
  pill: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: c.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  pillActive: { backgroundColor: c.accent },
  pillDone: { backgroundColor: c.okDim },
  pillAdd: { backgroundColor: 'transparent', borderWidth: 1, borderStyle: 'dashed', borderColor: c.borderStrong },
  pillLabel: { ...font.display, fontSize: 20 },
  pillTrack: { position: 'absolute', left: 8, right: 8, bottom: 6, height: 3, borderRadius: 2, backgroundColor: c.surfaceHigh },
  pillFill: { height: 3, borderRadius: 2, backgroundColor: c.accent },

  aside: { width: 300, gap: space.xs, padding: space.lg, borderRadius: radius.xl, backgroundColor: c.surface },
  asideRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, paddingHorizontal: space.sm, borderRadius: radius.md },
  asideRowActive: { backgroundColor: c.surfaceAlt },
  asideNum: { width: 26, height: 26, borderRadius: 13, backgroundColor: c.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
  asideNumDone: { backgroundColor: c.okDim },
  asideNumLabel: { color: c.textDim, fontSize: 12, fontWeight: '700' },
  asideName: { flex: 1, color: c.textDim, fontSize: 13, fontWeight: '600' },
  asideCount: { color: c.textFaint, fontSize: 12 },

  exCard: { backgroundColor: c.surface, borderRadius: radius.xl, padding: space.lg, gap: space.lg },
  exHead: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  exTitle: { ...font.display, fontSize: 32, lineHeight: 36, color: c.text, marginTop: space.xs },
  targetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: space.sm },
  targetItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  targetText: { color: c.textDim, fontSize: 12 },
  lastTime: { gap: space.sm, paddingTop: space.md, borderTopWidth: 1, borderTopColor: c.border },
  lastTimeLabel: { ...type.overline, fontSize: 9, letterSpacing: 1.4 },
  lastTimeEmpty: { color: c.textDim, fontSize: 12, lineHeight: 18 },
  lastChips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  lastChip: { paddingHorizontal: space.sm, paddingVertical: 5, borderRadius: radius.sm, backgroundColor: c.surfaceAlt },
  lastChipActive: { backgroundColor: c.accentDim, borderWidth: 1, borderColor: c.accent },
  lastChipText: { color: c.text, fontSize: 13, fontWeight: '600' },

  setCard: { backgroundColor: c.surface, borderRadius: radius.xl, padding: space.lg, gap: space.md, borderWidth: 1, borderColor: c.accent },
  setCardWarmup: { borderColor: c.warn },
  setHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  stepperLabel: { width: 40, color: c.textFaint, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  stepBtn: { width: 56, height: 64, borderRadius: radius.md, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  stepBtnPressed: { backgroundColor: c.surfaceHigh },
  stepValueWrap: { flex: 1, height: 64, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: c.bg },
  stepValue: { ...font.display, fontSize: 46, lineHeight: 52, color: c.text },
  hint: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: c.prDim },
  hintTitle: { color: c.pr, fontSize: 14, fontWeight: '700' },
  hintText: { color: c.pr, fontSize: 12, lineHeight: 17, opacity: 0.85 },
  hintAction: { color: c.pr, fontSize: 12, fontWeight: '700', textDecorationLine: 'underline' },
  matching: { color: c.textDim, fontSize: 12, textAlign: 'center' },
  setTools: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'center' },
  tool: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: c.surfaceAlt },
  toolLabel: { color: c.textDim, fontSize: 12, fontWeight: '600' },
  linkDim: { color: c.textDim, fontSize: 13, fontWeight: '600' },

  doneCard: { backgroundColor: c.surface, borderRadius: radius.xl, padding: space.xl, gap: space.md, alignItems: 'center', borderWidth: 1, borderColor: c.okDim },
  doneIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: c.okDim, alignItems: 'center', justifyContent: 'center' },
  doneTitle: { ...font.display, fontSize: 30, color: c.text },
  doneMeta: { color: c.textDim, fontSize: 13, textAlign: 'center' },
  doneBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'center' },
  doneNext: { color: c.textFaint, fontSize: 12, textAlign: 'center', lineHeight: 18 },

  setsList: { gap: space.xs, paddingTop: space.sm },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48, paddingHorizontal: space.sm, borderRadius: radius.md },
  setRowPending: { opacity: 0.55 },
  setCheck: { width: 28, height: 28, borderRadius: 14, backgroundColor: c.okDim, alignItems: 'center', justifyContent: 'center' },
  setCheckWarmup: { backgroundColor: c.surfaceHigh },
  setCheckLabel: { color: c.warn, fontSize: 12, fontWeight: '800' },
  setNum: { width: 28, textAlign: 'center', color: c.textFaint, fontSize: 13, fontWeight: '800' },
  setValue: { flex: 1, color: c.text, fontSize: 16, fontWeight: '700' },
  setValuePending: { color: c.textDim, fontWeight: '600' },
  setMeta: { color: c.textFaint, fontSize: 11 },
  addSet: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, height: 44, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: c.border, marginTop: space.xs },

  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: space.sm },
  navBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 44, paddingHorizontal: space.sm },
  navLabel: { fontSize: 13, fontWeight: '600' },
  navTools: { flexDirection: 'row', gap: space.sm },
  navIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },

  discard: { color: c.textFaint, fontSize: 13, textAlign: 'center', paddingVertical: space.lg, textDecorationLine: 'underline' },

  upNext: { padding: space.lg, borderRadius: radius.lg, backgroundColor: c.surface, gap: 4 },
  upNextName: { color: c.text, fontSize: 16, fontWeight: '700' },
  upNextMeta: { color: c.textFaint, fontSize: 12 },
});
