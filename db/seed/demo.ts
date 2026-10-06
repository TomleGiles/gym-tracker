import { eq } from 'drizzle-orm';

import { uuidv7 } from '../../lib/id';
import { bumpRevision, db } from '../client';
import { addExerciseToRoutine, createRoutine } from '../queries/routines';
import { recomputeExerciseStats } from '../queries/sessions';
import { session, sessionExercise, setLog } from '../schema';

/*
 * Données de démo — développement uniquement (bouton dans le Profil en __DEV__).
 * Cinq semaines de Push / Pull / Legs avec une progression crédible, pour
 * travailler l'UI sur des écrans remplis plutôt que sur des états vides.
 * Rien n'est poussé dans sync_queue : ces lignes n'ont pas vocation à partir.
 */

type Plan = { name: string; color: string; items: [exerciseId: string, startKg: number, reps: string][] };

const PLANS: Plan[] = [
  {
    name: 'Push',
    color: '#FF5A36',
    items: [
      ['bench_press_barbell', 70, '6-8'],
      ['incline_bench_press_dumbbell', 26, '8-10'],
      ['overhead_press_barbell', 42.5, '6-8'],
      ['lateral_raise_dumbbell', 10, '12-15'],
      ['triceps_pushdown_rope', 25, '10-12'],
    ],
  },
  {
    name: 'Pull',
    color: '#60A5FA',
    items: [
      ['pull_up', 0, '6-10'],
      ['barbell_row', 60, '8-10'],
      ['lat_pulldown_wide', 55, '10-12'],
      ['face_pull', 20, '15'],
      ['hammer_curl', 14, '10-12'],
    ],
  },
  {
    name: 'Legs',
    color: '#34D399',
    items: [
      ['back_squat', 90, '5-6'],
      ['romanian_deadlift', 80, '8-10'],
      ['leg_press', 160, '10-12'],
      ['lying_leg_curl', 35, '10-12'],
      ['standing_calf_raise', 60, '12-15'],
    ],
  },
];

export function seedDemoData(): void {
  const routines = PLANS.map((plan) => {
    const id = createRoutine({ name: plan.name, color: plan.color });
    for (const [exerciseId, , reps] of plan.items) {
      addExerciseToRoutine(id, exerciseId, { targetSets: 3, targetReps: reps });
    }
    return { id, plan };
  });

  // 3 séances par semaine sur 5 semaines, la dernière il y a 1 jour.
  const DAY = 86_400_000;
  const offsets = [36, 34, 32, 29, 27, 25, 22, 20, 18, 15, 13, 11, 8, 6, 4, 3, 1];

  offsets.forEach((daysAgo, n) => {
    const { id: routineId, plan } = routines[n % routines.length];
    const cycle = Math.floor(n / routines.length); // nombre de fois où ce plan a déjà été fait
    const start = new Date(Date.now() - daysAgo * DAY);
    start.setHours(18, 15 + (n % 3) * 10, 0, 0);
    const startedAt = start.toISOString();
    const sessionId = uuidv7();
    let clock = start.getTime();

    db.transaction((tx) => {
      tx.insert(session)
        .values({ id: sessionId, routineId, routineName: plan.name, startedAt, updatedAt: startedAt })
        .run();

      plan.items.forEach(([exerciseId, startKg, reps], position) => {
        tx.insert(sessionExercise)
          .values({
            id: uuidv7(),
            sessionId,
            exerciseId,
            position,
            targetSets: 3,
            targetReps: reps,
            updatedAt: startedAt,
          })
          .run();

        // On monte la charge un cycle sur deux ; entre les deux, une séance
        // moins bonne. Un record toutes les deux séances, pas à chaque fois.
        const step = startKg >= 60 ? 2.5 : startKg >= 20 ? 1.25 : startKg > 0 ? 1 : 0;
        const weight = startKg + step * Math.floor(cycle / 2);
        const topReps = Number(reps.split('-').pop()) - (cycle % 2) * 2;
        for (let s = 1; s <= 3; s++) {
          clock += 3 * 60_000;
          const at = new Date(clock).toISOString();
          tx.insert(setLog)
            .values({
              id: uuidv7(),
              sessionId,
              exerciseId,
              setIndex: s,
              weightKg: weight,
              reps: Math.max(1, topReps - (s - 1)),
              loggedAt: at,
              updatedAt: at,
            })
            .run();
        }
      });

      const endedAt = new Date(clock + 4 * 60_000).toISOString();
      tx.update(session).set({ endedAt }).where(eq(session.id, sessionId)).run();
    });
  });

  // Recalcule stats et drapeaux de PR à partir de l'historique inséré.
  for (const plan of PLANS) for (const [exerciseId] of plan.items) recomputeExerciseStats(exerciseId);
  bumpRevision();
}
