import { eq } from 'drizzle-orm';

import { db } from '../client';
import { addExerciseToRoutine, createRoutine } from '../queries/routines';
import { routine } from '../schema';

/*
 * Programmes de départ. Un nouvel utilisateur sans modèle de séance ne sait pas
 * quoi lancer ; un appui crée un split complet qu'il pourra modifier ensuite.
 * Les ids d'exercice viennent de seed/exercises.json.
 */

type Item = [exerciseId: string, sets: number, reps: string, restSeconds: number];
type Program = {
  id: string;
  name: string;
  tagline: string;
  daysPerWeek: number;
  routines: { name: string; color: string; items: Item[] }[];
};

export const PROGRAMS: Program[] = [
  {
    id: 'ppl',
    name: 'Push · Pull · Legs',
    tagline: 'Le classique pour progresser en hypertrophie',
    daysPerWeek: 3,
    routines: [
      {
        name: 'Push',
        color: '#FF5A36',
        items: [
          ['bench_press_barbell', 3, '6-8', 150],
          ['incline_bench_press_dumbbell', 3, '8-10', 120],
          ['overhead_press_barbell', 3, '6-8', 120],
          ['lateral_raise_dumbbell', 3, '12-15', 75],
          ['triceps_pushdown_rope', 3, '10-12', 75],
        ],
      },
      {
        name: 'Pull',
        color: '#60A5FA',
        items: [
          ['pull_up', 3, '6-10', 150],
          ['barbell_row', 3, '8-10', 120],
          ['lat_pulldown_wide', 3, '10-12', 90],
          ['face_pull', 3, '15', 60],
          ['hammer_curl', 3, '10-12', 75],
        ],
      },
      {
        name: 'Legs',
        color: '#34D399',
        items: [
          ['back_squat', 3, '5-6', 180],
          ['romanian_deadlift', 3, '8-10', 150],
          ['leg_press', 3, '10-12', 120],
          ['lying_leg_curl', 3, '10-12', 75],
          ['standing_calf_raise', 3, '12-15', 60],
        ],
      },
    ],
  },
  {
    id: 'upper-lower',
    name: 'Haut · Bas',
    tagline: 'Chaque muscle deux fois par semaine',
    daysPerWeek: 4,
    routines: [
      {
        name: 'Haut du corps',
        color: '#A78BFA',
        items: [
          ['bench_press_barbell', 3, '6-8', 150],
          ['barbell_row', 3, '8-10', 120],
          ['overhead_press_dumbbell', 3, '8-10', 120],
          ['lat_pulldown_neutral', 3, '10-12', 90],
          ['triceps_pushdown_rope', 2, '10-12', 60],
          ['dumbbell_curl', 2, '10-12', 60],
        ],
      },
      {
        name: 'Bas du corps',
        color: '#FBBF24',
        items: [
          ['back_squat', 3, '5-6', 180],
          ['romanian_deadlift', 3, '8-10', 150],
          ['leg_press', 3, '10-12', 120],
          ['seated_leg_curl', 3, '10-12', 75],
          ['standing_calf_raise', 3, '12-15', 60],
        ],
      },
    ],
  },
  {
    id: 'full-body',
    name: 'Full body',
    tagline: 'Idéal pour débuter, 2 à 3 séances',
    daysPerWeek: 3,
    routines: [
      {
        name: 'Full body A',
        color: '#F472B6',
        items: [
          ['back_squat', 3, '6-8', 150],
          ['bench_press_barbell', 3, '6-8', 150],
          ['barbell_row', 3, '8-10', 120],
          ['overhead_press_dumbbell', 2, '10-12', 90],
          ['cable_crunch', 2, '12-15', 60],
        ],
      },
      {
        name: 'Full body B',
        color: '#60A5FA',
        items: [
          ['romanian_deadlift', 3, '8-10', 150],
          ['incline_bench_press_dumbbell', 3, '8-10', 120],
          ['lat_pulldown_wide', 3, '10-12', 90],
          ['walking_lunge', 2, '10-12', 90],
          ['hammer_curl', 2, '10-12', 60],
        ],
      },
    ],
  },
];

/** Crée les modèles du programme. Renvoie l'id du premier, pour enchaîner dessus. */
export function installProgram(programId: string): string | null {
  const program = PROGRAMS.find((p) => p.id === programId);
  if (!program) return null;
  let first: string | null = null;
  const base = Date.now();
  program.routines.forEach((r, i) => {
    const id = createRoutine({ name: r.name, color: r.color });
    // Créés dans la même milliseconde, les modèles auraient le même created_at,
    // et l'UUID v7 est aléatoire à l'intérieur d'une milliseconde. Or c'est cet
    // ordre qui désigne la première « prochaine séance » (getNextRoutine).
    db.update(routine)
      .set({ createdAt: new Date(base + i).toISOString() })
      .where(eq(routine.id, id))
      .run();
    first ??= id;
    for (const [exerciseId, targetSets, targetReps, restSeconds] of r.items) {
      addExerciseToRoutine(id, exerciseId, { targetSets, targetReps, restSeconds });
    }
  });
  return first;
}
