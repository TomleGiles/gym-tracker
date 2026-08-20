import { and, asc, eq, isNull, max, sql } from 'drizzle-orm';

import { bumpRevision, db } from '../client';
import { nowIso, uuidv7 } from '../../lib/id';
import { exercise, routine, routineItem } from '../schema';
import type { Exercise, Routine, RoutineItem } from '../schema';
import { queueOp } from './sync';

export type RoutineItemWithExercise = RoutineItem & { exercise: Exercise };
export type RoutineDetail = Routine & { items: RoutineItemWithExercise[] };

const alive = <T extends { deletedAt: unknown }>(t: T) => isNull(t.deletedAt as never);

export function listRoutines(opts: { includeArchived?: boolean } = {}): (Routine & {
  itemCount: number;
})[] {
  const where = [alive(routine)];
  if (!opts.includeArchived) where.push(isNull(routine.archivedAt));

  // Jointure plutôt que sous-requête corrélée : voir le commentaire de
  // listSessions() dans db/queries/stats.ts — drizzle ne qualifie pas les
  // colonnes interpolées dans un `sql` brut sur une requête mono-table.
  const rows = db
    .select({ r: routine, itemCount: sql<number>`COUNT(${routineItem.id})` })
    .from(routine)
    .leftJoin(routineItem, and(eq(routineItem.routineId, routine.id), isNull(routineItem.deletedAt)))
    .where(and(...where))
    .groupBy(routine.id)
    .orderBy(asc(routine.name))
    .all();

  return rows.map((r) => ({ ...r.r, itemCount: r.itemCount }));
}

export function getRoutine(id: string): RoutineDetail | null {
  const r = db
    .select()
    .from(routine)
    .where(and(eq(routine.id, id), alive(routine)))
    .get();
  if (!r) return null;
  return { ...r, items: getRoutineItems(id) };
}

export function getRoutineItems(routineId: string): RoutineItemWithExercise[] {
  return db
    .select({ item: routineItem, ex: exercise })
    .from(routineItem)
    .innerJoin(exercise, eq(exercise.id, routineItem.exerciseId))
    .where(and(eq(routineItem.routineId, routineId), alive(routineItem)))
    .orderBy(asc(routineItem.position))
    .all()
    .map((r) => ({ ...r.item, exercise: r.ex }));
}

export function createRoutine(input: { name: string; color?: string | null; notes?: string | null }): string {
  const id = uuidv7();
  const ts = nowIso();
  db.transaction((tx) => {
    tx.insert(routine)
      .values({
        id,
        name: input.name.trim(),
        color: input.color ?? null,
        notes: input.notes?.trim() || null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    queueOp(tx, 'routine', id, 'insert', { ...input, id });
  });
  bumpRevision();
  return id;
}

export function updateRoutine(
  id: string,
  patch: Partial<Pick<Routine, 'name' | 'color' | 'notes' | 'archivedAt'>>,
): void {
  db.transaction((tx) => {
    tx.update(routine)
      .set({ ...patch, updatedAt: nowIso() })
      .where(eq(routine.id, id))
      .run();
    queueOp(tx, 'routine', id, 'update', patch);
  });
  bumpRevision();
}

/**
 * Suppression logique : l'historique conserve `session.routine_id`, et la sync
 * V2 a besoin de voir la suppression passer.
 */
export function deleteRoutine(id: string): void {
  const ts = nowIso();
  db.transaction((tx) => {
    tx.update(routine).set({ deletedAt: ts, updatedAt: ts }).where(eq(routine.id, id)).run();
    tx.update(routineItem)
      .set({ deletedAt: ts, updatedAt: ts })
      .where(eq(routineItem.routineId, id))
      .run();
    queueOp(tx, 'routine', id, 'delete');
  });
  bumpRevision();
}

export function addExerciseToRoutine(
  routineId: string,
  exerciseId: string,
  overrides: Partial<Pick<RoutineItem, 'targetSets' | 'targetReps' | 'restSeconds'>> = {},
): string {
  const id = uuidv7();
  const ts = nowIso();
  db.transaction((tx) => {
    const last = tx
      .select({ p: max(routineItem.position) })
      .from(routineItem)
      .where(and(eq(routineItem.routineId, routineId), alive(routineItem)))
      .get();
    tx.insert(routineItem)
      .values({
        id,
        routineId,
        exerciseId,
        position: (last?.p ?? -1) + 1,
        targetSets: overrides.targetSets ?? 3,
        targetReps: overrides.targetReps ?? '8-10',
        restSeconds: overrides.restSeconds ?? 120,
        updatedAt: ts,
      })
      .run();
    tx.update(routine).set({ updatedAt: ts }).where(eq(routine.id, routineId)).run();
    queueOp(tx, 'routine_item', id, 'insert', { routineId, exerciseId });
  });
  bumpRevision();
  return id;
}

export function updateRoutineItem(
  id: string,
  patch: Partial<Pick<RoutineItem, 'targetSets' | 'targetReps' | 'restSeconds' | 'notes' | 'supersetKey'>>,
): void {
  db.transaction((tx) => {
    tx.update(routineItem)
      .set({ ...patch, updatedAt: nowIso() })
      .where(eq(routineItem.id, id))
      .run();
    queueOp(tx, 'routine_item', id, 'update', patch);
  });
  bumpRevision();
}

export function removeRoutineItem(id: string): void {
  const ts = nowIso();
  db.transaction((tx) => {
    tx.update(routineItem).set({ deletedAt: ts, updatedAt: ts }).where(eq(routineItem.id, id)).run();
    queueOp(tx, 'routine_item', id, 'delete');
  });
  bumpRevision();
}

/** Réordonne : on réécrit toutes les positions, c'est trivial à 10 lignes. */
export function reorderRoutineItems(routineId: string, orderedIds: string[]): void {
  const ts = nowIso();
  db.transaction((tx) => {
    orderedIds.forEach((id, position) => {
      tx.update(routineItem).set({ position, updatedAt: ts }).where(eq(routineItem.id, id)).run();
    });
    tx.update(routine).set({ updatedAt: ts }).where(eq(routine.id, routineId)).run();
    queueOp(tx, 'routine_item', routineId, 'update', { order: orderedIds });
  });
  bumpRevision();
}

export function moveRoutineItem(routineId: string, id: string, delta: -1 | 1): void {
  const ids = getRoutineItems(routineId).map((i) => i.id);
  const from = ids.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) return;
  ids.splice(to, 0, ids.splice(from, 1)[0]);
  reorderRoutineItems(routineId, ids);
}

/** Duplique une séance modèle — le geste le plus courant après « Push 1 ». */
export function duplicateRoutine(id: string): string | null {
  const src = getRoutine(id);
  if (!src) return null;
  const newId = createRoutine({ name: `${src.name} (copie)`, color: src.color, notes: src.notes });
  const ts = nowIso();
  db.transaction((tx) => {
    for (const item of src.items) {
      tx.insert(routineItem)
        .values({
          id: uuidv7(),
          routineId: newId,
          exerciseId: item.exerciseId,
          position: item.position,
          targetSets: item.targetSets,
          targetReps: item.targetReps,
          restSeconds: item.restSeconds,
          supersetKey: item.supersetKey,
          notes: item.notes,
          updatedAt: ts,
        })
        .run();
    }
  });
  bumpRevision();
  return newId;
}
