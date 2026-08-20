import { and, asc, eq, inArray, like, or, sql } from 'drizzle-orm';

import { bumpRevision, db } from '../client';
import { exercise, exerciseMuscle, muscle } from '../schema';
import type { Equipment, Exercise, ExerciseWithMuscles, Muscle, MuscleRole } from '../schema';
import { queueOp } from './sync';

export type ExerciseFilters = {
  search?: string;
  /** Filtre sur le muscle *principal* : « montre-moi les exercices de dos ». */
  muscleIds?: string[];
  equipment?: Equipment[];
};

/** Un exercice de la liste, avec ses muscles principaux déjà résolus. */
export type ExerciseListItem = Exercise & { primaryLabels: string[] };

export function listExercises(filters: ExerciseFilters = {}): ExerciseListItem[] {
  const where = [];

  if (filters.search?.trim()) {
    // `unaccent` n'existe pas en SQLite : on compare sur une forme normalisée
    // pour que « developpe » trouve « Développé ».
    const needle = `%${normalize(filters.search)}%`;
    where.push(or(like(foldAccents(exercise.labelFr), needle), like(exercise.id, needle)));
  }
  if (filters.equipment?.length) {
    where.push(inArray(exercise.equipment, filters.equipment));
  }
  if (filters.muscleIds?.length) {
    const ids = sql.join(
      filters.muscleIds.map((id) => sql`${id}`),
      sql`, `,
    );
    where.push(
      sql`EXISTS (SELECT 1 FROM exercise_muscle em
                  WHERE em.exercise_id = ${exercise.id}
                    AND em.role = 'primary'
                    AND em.muscle_id IN (${ids}))`,
    );
  }

  const rows = db
    .select()
    .from(exercise)
    .where(where.length ? and(...where) : undefined)
    .orderBy(asc(exercise.labelFr))
    .all();

  if (!rows.length) return [];

  const labels = primaryLabelsFor(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, primaryLabels: labels.get(r.id) ?? [] }));
}

function primaryLabelsFor(ids: string[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (let i = 0; i < ids.length; i += 400) {
    const rows = db
      .select({ exerciseId: exerciseMuscle.exerciseId, label: muscle.labelFr })
      .from(exerciseMuscle)
      .innerJoin(muscle, eq(muscle.id, exerciseMuscle.muscleId))
      .where(
        and(eq(exerciseMuscle.role, 'primary'), inArray(exerciseMuscle.exerciseId, ids.slice(i, i + 400))),
      )
      .all();
    for (const r of rows) {
      const list = out.get(r.exerciseId) ?? [];
      list.push(r.label);
      out.set(r.exerciseId, list);
    }
  }
  return out;
}

export function getExercise(id: string): ExerciseWithMuscles | null {
  const row = db.select().from(exercise).where(eq(exercise.id, id)).get();
  if (!row) return null;
  return { ...row, muscles: musclesOf([id]).get(id) ?? [] };
}

/** Muscles de plusieurs exercices d'un coup — évite le N+1 sur l'aperçu de séance. */
export function musclesOf(
  exerciseIds: string[],
): Map<string, { muscle: Muscle; role: MuscleRole }[]> {
  const out = new Map<string, { muscle: Muscle; role: MuscleRole }[]>();
  if (!exerciseIds.length) return out;

  for (let i = 0; i < exerciseIds.length; i += 400) {
    const rows = db
      .select({ exerciseId: exerciseMuscle.exerciseId, role: exerciseMuscle.role, m: muscle })
      .from(exerciseMuscle)
      .innerJoin(muscle, eq(muscle.id, exerciseMuscle.muscleId))
      .where(inArray(exerciseMuscle.exerciseId, exerciseIds.slice(i, i + 400)))
      .all();
    for (const r of rows) {
      const list = out.get(r.exerciseId) ?? [];
      list.push({ muscle: r.m, role: r.role });
      out.set(r.exerciseId, list);
    }
  }
  // primary d'abord, puis secondary, puis stabilizer
  const order: Record<MuscleRole, number> = { primary: 0, secondary: 1, stabilizer: 2 };
  for (const list of out.values()) {
    list.sort((a, b) => order[a.role] - order[b.role] || a.muscle.labelFr.localeCompare(b.muscle.labelFr));
  }
  return out;
}

export function listMuscles(): Muscle[] {
  return db.select().from(muscle).orderBy(asc(muscle.region), asc(muscle.labelFr)).all();
}

export function getExercisesByIds(ids: string[]): Map<string, Exercise> {
  const out = new Map<string, Exercise>();
  if (!ids.length) return out;
  for (let i = 0; i < ids.length; i += 400) {
    for (const r of db.select().from(exercise).where(inArray(exercise.id, ids.slice(i, i + 400))).all()) {
      out.set(r.id, r);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Exercices personnalisés
 * ------------------------------------------------------------------ */

export type CustomExerciseInput = {
  labelFr: string;
  equipment: Equipment;
  mechanic: 'compound' | 'isolation';
  isUnilateral?: boolean;
  barWeightKg?: number | null;
  cues?: string | null;
  primary: string[];
  secondary?: string[];
};

export function createCustomExercise(input: CustomExerciseInput): string {
  const id = `custom_${slug(input.labelFr)}_${Date.now().toString(36)}`;
  db.transaction((tx) => {
    tx.insert(exercise)
      .values({
        id,
        labelFr: input.labelFr.trim(),
        equipment: input.equipment,
        mechanic: input.mechanic,
        isUnilateral: input.isUnilateral ?? false,
        barWeightKg: input.barWeightKg ?? null,
        cues: input.cues?.trim() || null,
        isCustom: true,
      })
      .run();

    const links = [
      ...input.primary.map((m) => ({ exerciseId: id, muscleId: m, role: 'primary' as const })),
      ...(input.secondary ?? []).map((m) => ({
        exerciseId: id,
        muscleId: m,
        role: 'secondary' as const,
      })),
    ];
    if (links.length) tx.insert(exerciseMuscle).values(links).run();
    queueOp(tx, 'exercise', id, 'insert', { ...input, id });
  });
  bumpRevision();
  return id;
}

const slug = (s: string) =>
  normalize(s).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'exercice';

/** Minuscules sans accents — la forme sur laquelle on compare les recherches. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Équivalent SQLite de `normalize()`. SQLite n'a ni unaccent ni REGEXP par
 * défaut, mais LOWER + une pile de REPLACE couvre le français sans extension.
 */
const ACCENTS: [string, string][] = [
  ['à', 'a'], ['â', 'a'], ['ä', 'a'], ['á', 'a'],
  ['é', 'e'], ['è', 'e'], ['ê', 'e'], ['ë', 'e'],
  ['î', 'i'], ['ï', 'i'], ['í', 'i'],
  ['ô', 'o'], ['ö', 'o'], ['ó', 'o'],
  ['ù', 'u'], ['û', 'u'], ['ü', 'u'],
  ['ç', 'c'], ['œ', 'oe'],
];

function foldAccents(column: typeof exercise.labelFr) {
  return ACCENTS.reduce(
    (expr, [from, to]) => sql`REPLACE(${expr}, ${from}, ${to})`,
    sql`LOWER(${column})`,
  );
}
