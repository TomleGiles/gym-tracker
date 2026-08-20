import { and, asc, desc, eq, inArray, isNull, max, ne, sql } from 'drizzle-orm';

import { nowIso, uuidv7 } from '../../lib/id';
import { e1rm } from '../../lib/strength';
import { bumpRevision, db } from '../client';
import { exercise, exerciseStats, session, sessionExercise, setLog } from '../schema';
import type { Exercise, ExerciseInSession, Session, SetLog, SetType } from '../schema';
import { getRoutine } from './routines';
import { queueOp } from './sync';

/* ------------------------------------------------------------------ *
 * Cycle de vie d'une séance
 * ------------------------------------------------------------------ */

/** La séance en cours, s'il y en a une : `ended_at IS NULL`. */
export function getActiveSession(): Session | null {
  return (
    db
      .select()
      .from(session)
      .where(and(isNull(session.endedAt), isNull(session.deletedAt)))
      .orderBy(desc(session.startedAt))
      .limit(1)
      .get() ?? null
  );
}

export function getSession(id: string): Session | null {
  return db.select().from(session).where(eq(session.id, id)).get() ?? null;
}

/**
 * Démarre une séance. Le modèle est copié dans `session_exercise` : à partir
 * d'ici, modifier « Push 1 » n'affecte plus la séance en cours.
 */
export function startSession(routineId: string | null): string {
  const id = uuidv7();
  const ts = nowIso();
  const routine = routineId ? getRoutine(routineId) : null;

  db.transaction((tx) => {
    tx.insert(session)
      .values({
        id,
        routineId: routine?.id ?? null,
        routineName: routine?.name ?? 'Séance libre',
        startedAt: ts,
        updatedAt: ts,
      })
      .run();

    for (const item of routine?.items ?? []) {
      tx.insert(sessionExercise)
        .values({
          id: uuidv7(),
          sessionId: id,
          exerciseId: item.exerciseId,
          position: item.position,
          targetSets: item.targetSets,
          targetReps: item.targetReps,
          restSeconds: item.restSeconds ?? 120,
          supersetKey: item.supersetKey,
          notes: item.notes,
          updatedAt: ts,
        })
        .run();
    }
    queueOp(tx, 'session', id, 'insert', { routineId, startedAt: ts });
  });

  bumpRevision();
  return id;
}

export function endSession(id: string): void {
  const ts = nowIso();
  db.transaction((tx) => {
    tx.update(session).set({ endedAt: ts, updatedAt: ts }).where(eq(session.id, id)).run();
    queueOp(tx, 'session', id, 'update', { endedAt: ts });
  });
  // §11 : les stats par exercice sont rafraîchies en fin de séance, pas à
  // l'affichage. Le PR détecté à la volée les a déjà avancées ; ce passage
  // rattrape les cas d'édition/suppression de série.
  for (const exId of exerciseIdsOfSession(id)) recomputeExerciseStats(exId);
  bumpRevision();
}

export function updateSessionNotes(id: string, patch: { notes?: string | null; bodyweightKg?: number | null }): void {
  db.transaction((tx) => {
    tx.update(session)
      .set({ ...patch, updatedAt: nowIso() })
      .where(eq(session.id, id))
      .run();
    queueOp(tx, 'session', id, 'update', patch);
  });
  bumpRevision();
}

/** Abandonne une séance : suppression logique, elle disparaît de l'historique. */
export function discardSession(id: string): void {
  const ts = nowIso();
  db.transaction((tx) => {
    tx.update(session).set({ deletedAt: ts, endedAt: ts, updatedAt: ts }).where(eq(session.id, id)).run();
    tx.update(setLog).set({ deletedAt: ts, updatedAt: ts }).where(eq(setLog.sessionId, id)).run();
    queueOp(tx, 'session', id, 'delete');
  });
  for (const exId of exerciseIdsOfSession(id)) recomputeExerciseStats(exId);
  bumpRevision();
}

function exerciseIdsOfSession(sessionId: string): string[] {
  return db
    .selectDistinct({ id: setLog.exerciseId })
    .from(setLog)
    .where(eq(setLog.sessionId, sessionId))
    .all()
    .map((r) => r.id);
}

/* ------------------------------------------------------------------ *
 * Composition de la séance
 * ------------------------------------------------------------------ */

export function addExerciseToSession(sessionId: string, exerciseId: string): string {
  const id = uuidv7();
  const ts = nowIso();
  db.transaction((tx) => {
    const last = tx
      .select({ p: max(sessionExercise.position) })
      .from(sessionExercise)
      .where(and(eq(sessionExercise.sessionId, sessionId), isNull(sessionExercise.deletedAt)))
      .get();
    tx.insert(sessionExercise)
      .values({
        id,
        sessionId,
        exerciseId,
        position: (last?.p ?? -1) + 1,
        targetSets: 3,
        targetReps: '8-10',
        restSeconds: 120,
        updatedAt: ts,
      })
      .run();
    queueOp(tx, 'session_exercise', id, 'insert', { sessionId, exerciseId });
  });
  bumpRevision();
  return id;
}

/** Retire un exercice de la séance. Ses séries déjà loggées, elles, restent. */
export function removeExerciseFromSession(slotId: string): void {
  const ts = nowIso();
  db.transaction((tx) => {
    tx.update(sessionExercise)
      .set({ deletedAt: ts, updatedAt: ts })
      .where(eq(sessionExercise.id, slotId))
      .run();
    queueOp(tx, 'session_exercise', slotId, 'delete');
  });
  bumpRevision();
}

/* ------------------------------------------------------------------ *
 * Vue de la séance
 * ------------------------------------------------------------------ */

/**
 * Tout ce dont l'écran de séance a besoin, en 4 requêtes quelle que soit la
 * taille de la séance. Le poids « de la dernière fois » vient de la dernière
 * séance *antérieure* qui contient l'exercice.
 */
export function getSessionView(sessionId: string): ExerciseInSession[] {
  const slots = db
    .select({ slot: sessionExercise, ex: exercise })
    .from(sessionExercise)
    .innerJoin(exercise, eq(exercise.id, sessionExercise.exerciseId))
    .where(and(eq(sessionExercise.sessionId, sessionId), isNull(sessionExercise.deletedAt)))
    .orderBy(asc(sessionExercise.position))
    .all();

  const todaySets = db
    .select()
    .from(setLog)
    .where(and(eq(setLog.sessionId, sessionId), isNull(setLog.deletedAt)))
    .orderBy(asc(setLog.setIndex))
    .all();

  const byExercise = new Map<string, SetLog[]>();
  for (const s of todaySets) {
    const list = byExercise.get(s.exerciseId) ?? [];
    list.push(s);
    byExercise.set(s.exerciseId, list);
  }

  // Un exercice loggé mais retiré de la liste doit rester visible : sinon on
  // « perd » des séries sans que rien ne l'explique.
  const orphans = [...byExercise.keys()].filter(
    (exId) => !slots.some((s) => s.ex.id === exId),
  );
  const orphanExercises = orphans.length
    ? db.select().from(exercise).where(inArray(exercise.id, orphans)).all()
    : [];

  const all: { slotId: string; ex: Exercise; slot: (typeof slots)[number]['slot'] | null }[] = [
    ...slots.map((s) => ({ slotId: s.slot.id, ex: s.ex, slot: s.slot })),
    ...orphanExercises.map((ex) => ({ slotId: `orphan:${ex.id}`, ex, slot: null })),
  ];

  return all.map(({ slotId, ex, slot }) => ({
    slotId,
    exercise: ex,
    targetSets: slot?.targetSets ?? 3,
    targetReps: slot?.targetReps ?? null,
    restSeconds: slot?.restSeconds ?? 120,
    supersetKey: slot?.supersetKey ?? null,
    lastTime: getLastPerformance(ex.id, sessionId),
    today: byExercise.get(ex.id) ?? [],
  }));
}

/** Les séries de la dernière séance (antérieure) contenant cet exercice. */
export function getLastPerformance(
  exerciseId: string,
  excludeSessionId?: string,
): { sets: SetLog[]; sessionDate: string } | null {
  const where = [eq(setLog.exerciseId, exerciseId), isNull(setLog.deletedAt)];
  if (excludeSessionId) where.push(ne(setLog.sessionId, excludeSessionId));

  const latest = db
    .select({ sessionId: setLog.sessionId, loggedAt: setLog.loggedAt })
    .from(setLog)
    .where(and(...where))
    .orderBy(desc(setLog.loggedAt))
    .limit(1)
    .get();
  if (!latest) return null;

  const sets = db
    .select()
    .from(setLog)
    .where(
      and(
        eq(setLog.exerciseId, exerciseId),
        eq(setLog.sessionId, latest.sessionId),
        isNull(setLog.deletedAt),
      ),
    )
    .orderBy(asc(setLog.setIndex))
    .all();

  return { sets, sessionDate: latest.loggedAt };
}

/* ------------------------------------------------------------------ *
 * Saisie des séries — le chemin critique
 * ------------------------------------------------------------------ */

export type LogSetInput = {
  sessionId: string;
  exerciseId: string;
  weightKg: number;
  reps: number;
  rir?: number | null;
  setType?: SetType;
};

export type LogSetResult = { set: SetLog; isPr: boolean; previousBestE1rm: number };

/**
 * Enregistre une série. Synchrone de bout en bout : au moment où la ✓ répond,
 * la ligne est dans SQLite. Pas de bouton « sauvegarder », pas de promesse.
 *
 * Le PR est détecté ici plutôt que par un SELECT MAX sur tout l'historique :
 * `exercise_stats` tient le meilleur e1RM à jour, donc la détection est en O(1).
 */
export function logSet(input: LogSetInput): LogSetResult {
  const id = uuidv7();
  const ts = nowIso();
  const setType = input.setType ?? 'working';
  const value = e1rm(input.weightKg, input.reps);

  let result!: LogSetResult;

  db.transaction((tx) => {
    const nextIndex =
      (tx
        .select({ n: max(setLog.setIndex) })
        .from(setLog)
        .where(
          and(
            eq(setLog.sessionId, input.sessionId),
            eq(setLog.exerciseId, input.exerciseId),
            isNull(setLog.deletedAt),
          ),
        )
        .get()?.n ?? 0) + 1;

    const stats = tx
      .select()
      .from(exerciseStats)
      .where(eq(exerciseStats.exerciseId, input.exerciseId))
      .get();

    const previousBestE1rm = stats?.bestE1rm ?? 0;
    const isPr = setType !== 'warmup' && value > previousBestE1rm;

    const row = {
      id,
      sessionId: input.sessionId,
      exerciseId: input.exerciseId,
      setIndex: nextIndex,
      weightKg: input.weightKg,
      reps: input.reps,
      rir: input.rir ?? null,
      setType,
      isPr,
      loggedAt: ts,
      updatedAt: ts,
    };
    tx.insert(setLog).values(row).run();

    if (setType !== 'warmup') {
      const next = {
        exerciseId: input.exerciseId,
        bestE1rm: Math.max(previousBestE1rm, value),
        bestWeightKg: Math.max(stats?.bestWeightKg ?? 0, input.weightKg),
        bestSetVolume: Math.max(stats?.bestSetVolume ?? 0, input.weightKg * input.reps),
        bestReps: Math.max(stats?.bestReps ?? 0, input.reps),
        totalSets: (stats?.totalSets ?? 0) + 1,
        lastPerformedAt: ts,
        computedAt: ts,
      };
      tx.insert(exerciseStats)
        .values(next)
        .onConflictDoUpdate({ target: exerciseStats.exerciseId, set: next })
        .run();
    }

    tx.update(session).set({ updatedAt: ts }).where(eq(session.id, input.sessionId)).run();
    queueOp(tx, 'set_log', id, 'insert', row);

    result = { set: row as SetLog, isPr, previousBestE1rm };
  });

  bumpRevision();
  return result;
}

export function updateSet(
  id: string,
  patch: Partial<Pick<SetLog, 'weightKg' | 'reps' | 'rir' | 'setType'>>,
): void {
  const ts = nowIso();
  const existing = db.select().from(setLog).where(eq(setLog.id, id)).get();
  if (!existing) return;

  db.transaction((tx) => {
    tx.update(setLog)
      .set({ ...patch, updatedAt: ts })
      .where(eq(setLog.id, id))
      .run();
    queueOp(tx, 'set_log', id, 'update', patch);
  });
  // Une correction peut annuler un PR : on repart de l'historique complet.
  recomputeExerciseStats(existing.exerciseId);
  bumpRevision();
}

export function deleteSet(id: string): void {
  const ts = nowIso();
  const existing = db.select().from(setLog).where(eq(setLog.id, id)).get();
  if (!existing) return;

  db.transaction((tx) => {
    tx.update(setLog).set({ deletedAt: ts, updatedAt: ts }).where(eq(setLog.id, id)).run();
    // Renumérote les séries suivantes pour que l'affichage reste 1, 2, 3…
    tx.update(setLog)
      .set({ setIndex: sql`${setLog.setIndex} - 1`, updatedAt: ts })
      .where(
        and(
          eq(setLog.sessionId, existing.sessionId),
          eq(setLog.exerciseId, existing.exerciseId),
          isNull(setLog.deletedAt),
          sql`${setLog.setIndex} > ${existing.setIndex}`,
        ),
      )
      .run();
    queueOp(tx, 'set_log', id, 'delete');
  });
  recomputeExerciseStats(existing.exerciseId);
  bumpRevision();
}

/** Recalcul complet des stats d'un exercice. Appelé hors du chemin critique. */
export function recomputeExerciseStats(exerciseId: string): void {
  const row = db
    .select({
      bestE1rm: sql<number>`COALESCE(MAX(${setLog.weightKg} * (1 + ${setLog.reps} / 30.0)), 0)`,
      bestWeightKg: sql<number>`COALESCE(MAX(${setLog.weightKg}), 0)`,
      bestSetVolume: sql<number>`COALESCE(MAX(${setLog.weightKg} * ${setLog.reps}), 0)`,
      bestReps: sql<number>`COALESCE(MAX(${setLog.reps}), 0)`,
      totalSets: sql<number>`COUNT(*)`,
      lastPerformedAt: sql<string | null>`MAX(${setLog.loggedAt})`,
    })
    .from(setLog)
    .where(
      and(
        eq(setLog.exerciseId, exerciseId),
        ne(setLog.setType, 'warmup'),
        isNull(setLog.deletedAt),
      ),
    )
    .get();

  const next = {
    exerciseId,
    bestE1rm: row?.bestE1rm ?? 0,
    bestWeightKg: row?.bestWeightKg ?? 0,
    bestSetVolume: row?.bestSetVolume ?? 0,
    bestReps: row?.bestReps ?? 0,
    totalSets: row?.totalSets ?? 0,
    lastPerformedAt: row?.lastPerformedAt ?? null,
    computedAt: nowIso(),
  };
  db.insert(exerciseStats)
    .values(next)
    .onConflictDoUpdate({ target: exerciseStats.exerciseId, set: next })
    .run();

  // Le drapeau is_pr doit rester cohérent avec l'historique après correction.
  db.run(sql`
    UPDATE set_log SET is_pr = 0
    WHERE exercise_id = ${exerciseId} AND deleted_at IS NULL AND is_pr = 1
  `);
  db.run(sql`
    UPDATE set_log SET is_pr = 1
    WHERE id IN (
      SELECT s.id FROM set_log s
      WHERE s.exercise_id = ${exerciseId}
        AND s.deleted_at IS NULL
        AND s.set_type <> 'warmup'
        AND s.weight_kg * (1 + s.reps / 30.0) > COALESCE((
          SELECT MAX(p.weight_kg * (1 + p.reps / 30.0)) FROM set_log p
          WHERE p.exercise_id = s.exercise_id
            AND p.deleted_at IS NULL
            AND p.set_type <> 'warmup'
            AND p.logged_at < s.logged_at
        ), 0)
    )
  `);
}
