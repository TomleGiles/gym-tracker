import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { logSet, updateSet } from '../db/queries/sessions';
import type { ExerciseInSession, SetLog } from '../db/schema';
import { e1rm, fmtKg, isWorkingSet, weightStep } from '../lib/strength';
import { useActiveSession } from '../stores/activeSession';
import { formatFr, parseFr } from './NumPad';
import type { NumPadRequest } from './NumPad';

/** Une série pas encore validée. `warmup` : à enregistrer comme échauffement. */
export type Draft = { weight: string; reps: string; warmup?: boolean };

type PadTarget = { target: 'draft' | 'logged'; index: number; field: 'weight' | 'reps' };

/** Repos après un échauffement : il prépare, il ne doit pas fatiguer. */
const WARMUP_REST_MAX = 60;

/** Montée en charge classique : [part de la charge de travail, reps]. */
const WARMUP_LADDER: [number, number][] = [
  [0.5, 10],
  [0.7, 5],
  [0.85, 3],
];

/**
 * La saisie des séries d'un exercice, partagée par la vue Focus et la vue
 * d'ensemble : brouillons pré-remplis, validation (SQLite + repos + PR),
 * correction d'une série déjà enregistrée, et le pavé numérique.
 *
 * Les échauffements ne comptent pas dans la cible : « 3 × 8 » veut dire trois
 * séries de travail, quel que soit le nombre de montées en charge avant.
 */
export function useExerciseSets(
  sessionId: string,
  entry: ExerciseInSession,
  onRested: (seconds: number) => void,
) {
  const flashPr = useActiveSession((s) => s.flashPr);
  const step = weightStep(entry.exercise.equipment);

  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [pad, setPad] = useState<PadTarget | null>(null);
  /** Tampon d'édition d'une série déjà enregistrée : on n'écrit qu'à la
   *  fermeture du pavé, sinon chaque frappe déclencherait un recalcul de PR. */
  const [loggedDraft, setLoggedDraft] = useState<Draft | null>(null);

  const workingDone = entry.today.filter(isWorkingSet).length;
  /** Lignes restant à valider pour atteindre la cible. */
  const pending = Math.max(0, entry.targetSets - workingDone);

  useEffect(() => {
    // On complète jusqu'à la cible sans jamais retirer une ligne ajoutée à la
    // main : validate() se charge de retirer celle qui vient d'être loggée.
    setDrafts((current) => {
      const working = current.filter((d) => !d.warmup).length;
      if (working >= pending) return current;
      const next = [...current];
      for (let i = working; i < pending; i++) next.push(prefill(workingDone + i, entry));
      return next;
    });
  }, [pending, workingDone, entry]);

  const patchDraft = (index: number, patch: Partial<Draft>) =>
    setDrafts((d) => d.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const addDraft = () =>
    setDrafts((d) => {
      const last = d[d.length - 1];
      return [...d, last ? { ...last, warmup: false } : prefill(workingDone + d.length, entry)];
    });

  const removeDraft = (index: number) => setDrafts((d) => d.filter((_, i) => i !== index));

  /**
   * Insère une série d'échauffement avant la première série de travail, à un
   * pourcentage de sa charge : 50 % × 10, puis 70 % × 5, puis 85 % × 3.
   */
  const addWarmup = () =>
    setDrafts((d) => {
      const firstWorking = d.findIndex((row) => !row.warmup);
      const reference = parseFr(d[firstWorking]?.weight ?? '') || entry.today.filter(isWorkingSet).at(-1)?.weightKg || 0;
      const already = entry.today.length - workingDone + d.filter((row) => row.warmup).length;
      const [pct, reps] = WARMUP_LADDER[Math.min(already, WARMUP_LADDER.length - 1)];
      const weight = reference ? Math.max(0, Math.round((reference * pct) / step) * step) : 0;
      const row: Draft = { weight: reference ? formatFr(weight) : '', reps: String(reps), warmup: true };
      const at = firstWorking === -1 ? d.length : firstWorking;
      return [...d.slice(0, at), row, ...d.slice(at)];
    });

  function validate(index: number) {
    const draft = drafts[index];
    if (!draft) return;
    const weightKg = parseFr(draft.weight);
    const reps = Math.round(parseFr(draft.reps));
    if (reps <= 0) {
      setPad({ target: 'draft', index, field: 'reps' });
      return;
    }

    const setType = draft.warmup ? 'warmup' : 'working';
    const result = logSet({ sessionId, exerciseId: entry.exercise.id, weightKg, reps, setType });
    // Les lignes suivantes laissées vides héritent de ce qui vient d'être fait :
    // le cas nominal reste « appuyer sur ✓ sans rien saisir » (§5). Un
    // échauffement ne sert pas de modèle : sa charge est volontairement basse.
    setDrafts((d) =>
      d
        .filter((_, i) => i !== index)
        .map((row) =>
          row.weight === '' && !draft.warmup
            ? { ...row, weight: formatFr(weightKg), reps: row.reps || String(reps) }
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
    onRested(draft.warmup ? Math.min(entry.restSeconds, WARMUP_REST_MAX) : entry.restSeconds);
  }

  const openDraft = (index: number, field: 'weight' | 'reps') => setPad({ target: 'draft', index, field });

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

  /** Numéro affiché d'un brouillon : les échauffements s'affichent « É ». */
  const draftNumber = (index: number) =>
    workingDone + drafts.slice(0, index).filter((d) => !d.warmup).length + 1;

  const padRequest: NumPadRequest | null = pad
    ? {
        key: `${entry.slotId}:${pad.target}:${pad.index}:${pad.field}`,
        title: entry.exercise.labelFr,
        subtitle:
          pad.target === 'draft'
            ? drafts[pad.index]?.warmup
              ? 'Échauffement'
              : `Série ${draftNumber(pad.index)}${entry.targetReps ? ` · cible ${entry.targetReps} reps` : ''}`
            : `Correction de la série ${pad.index + 1}`,
        field: pad.field,
        weight: pad.target === 'draft' ? (drafts[pad.index]?.weight ?? '') : (loggedDraft?.weight ?? ''),
        reps: pad.target === 'draft' ? (drafts[pad.index]?.reps ?? '') : (loggedDraft?.reps ?? ''),
        weightStep: step,
      }
    : null;

  const numPad = {
    request: padRequest,
    onChange: (patch: { weight?: string; reps?: string }) => {
      if (!pad) return;
      if (pad.target === 'draft') patchDraft(pad.index, patch);
      else setLoggedDraft((d) => ({ weight: '', reps: '', ...d, ...patch }));
    },
    onValidate: () => {
      if (!pad) return;
      if (pad.target === 'draft') validate(pad.index);
      else closePad();
    },
    onClose: closePad,
  };

  return {
    drafts,
    step,
    workingDone,
    /** Cible atteinte et plus rien en attente. */
    complete: entry.targetSets > 0 && workingDone >= entry.targetSets && drafts.length === 0,
    draftNumber,
    patchDraft,
    addDraft,
    addWarmup,
    removeDraft,
    validate,
    openDraft,
    openLogged,
    numPad,
  };
}

/** Les séries de travail de la dernière fois : les échauffements ne servent pas de référence. */
export const lastWorkingSets = (entry: ExerciseInSession): SetLog[] =>
  entry.lastTime?.sets.filter(isWorkingSet) ?? [];

/**
 * Valeur pré-remplie de la série de travail n° `setIndex` (0-based) :
 * la série correspondante de la dernière fois, sinon la dernière série faite
 * aujourd'hui, sinon la dernière série de la dernière fois.
 */
export function prefill(setIndex: number, entry: ExerciseInSession): Draft {
  const last = lastWorkingSets(entry);
  const previous = last[setIndex];
  if (previous) return { weight: formatFr(previous.weightKg), reps: String(previous.reps) };

  const today = entry.today.filter(isWorkingSet).at(-1);
  if (today) return { weight: formatFr(today.weightKg), reps: String(today.reps) };

  const lastEver = last.at(-1);
  if (lastEver) return { weight: formatFr(lastEver.weightKg), reps: String(lastEver.reps) };

  return { weight: '', reps: entry.targetReps?.split('-')[0] ?? '' };
}

/** Haut de la fourchette cible : « 8-10 » → 10, « 12 » → 12. */
export function topOfRange(targetReps: string | null): number | null {
  if (!targetReps) return null;
  const n = parseInt(targetReps.split('-').at(-1) ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Double progression : si la dernière fois cette série a atteint le haut de la
 * fourchette à une charge donnée, on propose d'ajouter un cran. On ne propose
 * rien si la charge du jour est déjà au-dessus.
 */
export function progressionHint(
  entry: ExerciseInSession,
  setIndex: number,
  draft: Draft,
  step: number,
): { weightKg: number; title: string; detail: string } | null {
  if (draft.warmup) return null;
  const top = topOfRange(entry.targetReps);
  const previous = lastWorkingSets(entry)[setIndex];
  if (!top || !previous || previous.reps < top || previous.weightKg <= 0) return null;
  if (parseFr(draft.weight) > previous.weightKg) return null;
  const next = previous.weightKg + step;
  return {
    weightKg: next,
    title: `Tente ${fmtKg(next)} kg`,
    detail: `${previous.reps} reps à ${fmtKg(previous.weightKg)} kg la dernière fois : le haut de ta fourchette.`,
  };
}
