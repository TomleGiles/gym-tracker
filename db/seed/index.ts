import { eq, inArray, notInArray, sql } from 'drizzle-orm';

import { db } from '../client';
import { exercise, exerciseMuscle, meta, muscle } from '../schema';
import type { Equipment, Mechanic, MuscleRole, Region } from '../schema';
import raw from './exercises.json';

type SeedMuscle = {
  id: string;
  label_fr: string;
  region: Region;
  svg_front_id: string | null;
  svg_back_id: string | null;
};

type SeedExercise = {
  id: string;
  label_fr: string;
  equipment: Equipment;
  mechanic: Mechanic;
  is_unilateral?: boolean;
  bar_weight_kg?: number;
  cues: string;
  primary: string[];
  secondary?: string[];
  stabilizer?: string[];
};

const seed = raw as unknown as {
  seed_version: number;
  muscles: SeedMuscle[];
  exercises: SeedExercise[];
};

export const SEED_VERSION = seed.seed_version;

/**
 * Charge le référentiel. Idempotent et rejouable à chaque montée de version :
 *  - les exercices `is_custom = 1` ne sont jamais touchés ;
 *  - un exercice retiré du seed est conservé (l'historique pointe dessus) ;
 *  - relancer avec la même version ne fait rien.
 */
export function runSeed(): { applied: boolean; version: number } {
  const current = db.select().from(meta).where(eq(meta.key, 'seed_version')).get();
  if (current && Number(current.value) === SEED_VERSION) {
    return { applied: false, version: SEED_VERSION };
  }

  db.transaction((tx) => {
    for (const m of seed.muscles) {
      tx.insert(muscle)
        .values({
          id: m.id,
          labelFr: m.label_fr,
          region: m.region,
          svgFrontId: m.svg_front_id,
          svgBackId: m.svg_back_id,
        })
        .onConflictDoUpdate({
          target: muscle.id,
          set: {
            labelFr: m.label_fr,
            region: m.region,
            svgFrontId: m.svg_front_id,
            svgBackId: m.svg_back_id,
          },
        })
        .run();
    }

    const seededIds = seed.exercises.map((e) => e.id);

    for (const e of seed.exercises) {
      const row = {
        id: e.id,
        labelFr: e.label_fr,
        equipment: e.equipment,
        mechanic: e.mechanic,
        isUnilateral: e.is_unilateral ?? false,
        cues: e.cues,
        barWeightKg: e.bar_weight_kg ?? null,
        isCustom: false,
      };
      tx.insert(exercise)
        .values(row)
        .onConflictDoUpdate({
          target: exercise.id,
          set: row,
          // Un exercice que l'utilisateur a créé ou modifié lui appartient.
          setWhere: eq(exercise.isCustom, false),
        })
        .run();
    }

    // Les liens muscle↔exercice sont dérivés du seed : on les reconstruit
    // entièrement pour les exercices seedés, sans toucher aux exercices custom.
    tx.delete(exerciseMuscle).where(inArray(exerciseMuscle.exerciseId, seededIds)).run();

    const links = seed.exercises.flatMap((e) =>
      (
        [
          ['primary', e.primary],
          ['secondary', e.secondary ?? []],
          ['stabilizer', e.stabilizer ?? []],
        ] as [MuscleRole, string[]][]
      ).flatMap(([role, ids]) => ids.map((muscleId) => ({ exerciseId: e.id, muscleId, role }))),
    );
    // SQLite plafonne à 999 paramètres liés par requête : on découpe.
    for (let i = 0; i < links.length; i += 200) {
      tx.insert(exerciseMuscle).values(links.slice(i, i + 200)).run();
    }

    tx.insert(meta)
      .values({ key: 'seed_version', value: String(SEED_VERSION) })
      .onConflictDoUpdate({ target: meta.key, set: { value: String(SEED_VERSION) } })
      .run();
  });

  return { applied: true, version: SEED_VERSION };
}

/** Muscles orphelins : utile en dev si le seed retire un muscle du référentiel. */
export function pruneOrphanMuscles(): void {
  db.delete(muscle)
    .where(
      notInArray(
        muscle.id,
        sql`(SELECT muscle_id FROM exercise_muscle)`,
      ),
    )
    .run();
}
