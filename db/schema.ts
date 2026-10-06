import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/* ------------------------------------------------------------------ *
 * Référentiel — livré avec l'app, réécrit par le seed, jamais par l'UI
 * (sauf exercise.is_custom = 1).
 * ------------------------------------------------------------------ */

export const muscle = sqliteTable('muscle', {
  id: text('id').primaryKey(), // 'pectoralis_major'
  labelFr: text('label_fr').notNull(),
  region: text('region').$type<Region>().notNull(),
  svgFrontId: text('svg_front_id'),
  svgBackId: text('svg_back_id'),
});

export const exercise = sqliteTable('exercise', {
  id: text('id').primaryKey(), // 'bench_press_barbell'
  labelFr: text('label_fr').notNull(),
  equipment: text('equipment').$type<Equipment>().notNull(),
  mechanic: text('mechanic').$type<Mechanic>().notNull(),
  isUnilateral: integer('is_unilateral', { mode: 'boolean' }).notNull().default(false),
  cues: text('cues'),
  // §11 « barres à vide » : poids de la barre/du chariot à vide, ajouté au tonnage.
  // NULL = le champ « poids » est ce qui est écrit sur la machine.
  barWeightKg: real('bar_weight_kg'),
  isCustom: integer('is_custom', { mode: 'boolean' }).notNull().default(false),
});

export const exerciseMuscle = sqliteTable(
  'exercise_muscle',
  {
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercise.id, { onDelete: 'cascade' }),
    muscleId: text('muscle_id')
      .notNull()
      .references(() => muscle.id),
    role: text('role').$type<MuscleRole>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.exerciseId, t.muscleId] })],
);

/* ------------------------------------------------------------------ *
 * Catalogue de séances — données utilisateur.
 * PK = UUID v7 côté client, updated_at + deleted_at pour la sync V2.
 * ------------------------------------------------------------------ */

export const routine = sqliteTable('routine', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  color: text('color'),
  notes: text('notes'),
  archivedAt: text('archived_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
});

export const routineItem = sqliteTable(
  'routine_item',
  {
    id: text('id').primaryKey(),
    routineId: text('routine_id')
      .notNull()
      .references(() => routine.id, { onDelete: 'cascade' }),
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercise.id),
    position: integer('position').notNull(),
    targetSets: integer('target_sets').notNull().default(3),
    targetReps: text('target_reps'), // '8-10' : c'est une fourchette, donc du texte
    restSeconds: integer('rest_seconds').default(120),
    supersetKey: text('superset_key'),
    notes: text('notes'),
    updatedAt: text('updated_at').notNull(),
    deletedAt: text('deleted_at'),
  },
  (t) => [index('idx_routine_item_routine').on(t.routineId, t.position)],
);

/* ------------------------------------------------------------------ *
 * Historique — immuable une fois la séance terminée.
 * ------------------------------------------------------------------ */

export const session = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    routineId: text('routine_id').references(() => routine.id),
    // Figé volontairement : renommer « Push 1 » ne doit pas réécrire l'historique.
    routineName: text('routine_name').notNull(),
    startedAt: text('started_at').notNull(),
    endedAt: text('ended_at'), // NULL = séance en cours
    bodyweightKg: real('bodyweight_kg'),
    notes: text('notes'),
    updatedAt: text('updated_at').notNull(),
    deletedAt: text('deleted_at'),
  },
  (t) => [index('idx_session_started').on(t.startedAt)],
);

/**
 * Composition de la séance, figée à son démarrage à partir de `routine_item`.
 *
 * Le spec ne prévoit pas cette table, mais elle manquait : la liste des
 * exercices d'une séance en cours est **mutable** (on ajoute un exercice parce
 * que le rack est pris) et doit **survivre à un kill de l'app** — or
 * `routine_item` est un modèle partagé et immuable pendant la séance, et
 * `set_log` ne connaît que les exercices déjà loggés. Snapshotter ici suit
 * exactement la même logique que `session.routine_name` : l'historique ne bouge
 * pas quand tu réorganises « Push 1 ».
 *
 * `set_log` reste attaché à `exercise_id`, sans FK vers cette table (décision 2
 * du §3 du spec).
 */
export const sessionExercise = sqliteTable(
  'session_exercise',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => session.id, { onDelete: 'cascade' }),
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercise.id),
    position: integer('position').notNull(),
    targetSets: integer('target_sets').notNull().default(3),
    targetReps: text('target_reps'),
    restSeconds: integer('rest_seconds').notNull().default(120),
    supersetKey: text('superset_key'),
    notes: text('notes'),
    updatedAt: text('updated_at').notNull(),
    deletedAt: text('deleted_at'),
  },
  (t) => [index('idx_session_exercise').on(t.sessionId, t.position)],
);

export const setLog = sqliteTable(
  'set_log',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => session.id, { onDelete: 'cascade' }),
    // Pas de FK vers routine_item : en séance on ajoute/retire des exercices à la
    // volée, le log est attaché à l'exercice — le modèle n'est qu'une suggestion.
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercise.id),
    setIndex: integer('set_index').notNull(),
    weightKg: real('weight_kg').notNull(),
    reps: integer('reps').notNull(),
    rir: integer('rir'),
    setType: text('set_type').$type<SetType>().notNull().default('working'),
    isPr: integer('is_pr', { mode: 'boolean' }).notNull().default(false),
    loggedAt: text('logged_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    deletedAt: text('deleted_at'),
  },
  (t) => [
    index('idx_setlog_exercise').on(t.exerciseId, t.loggedAt),
    index('idx_setlog_session').on(t.sessionId),
  ],
);

/* ------------------------------------------------------------------ *
 * Stats matérialisées — §11 « ne pas recalculer sur 2 ans d'historique ».
 * Rafraîchi en fin de séance (et à la validation d'un PR).
 * ------------------------------------------------------------------ */

export const exerciseStats = sqliteTable('exercise_stats', {
  exerciseId: text('exercise_id')
    .primaryKey()
    .references(() => exercise.id, { onDelete: 'cascade' }),
  bestE1rm: real('best_e1rm').notNull().default(0),
  bestWeightKg: real('best_weight_kg').notNull().default(0),
  bestSetVolume: real('best_set_volume').notNull().default(0),
  bestReps: integer('best_reps').notNull().default(0),
  totalSets: integer('total_sets').notNull().default(0),
  lastPerformedAt: text('last_performed_at'),
  computedAt: text('computed_at').notNull(),
});

/* ------------------------------------------------------------------ *
 * Compte — local tant que la sync n'existe pas : un seul compte par
 * appareil, et toutes les données de cet appareil lui appartiennent.
 * Le jour du serveur (et du partage de séances), l'id UUID v7 devient
 * l'identifiant distant sans migration.
 * ------------------------------------------------------------------ */

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(), // toujours en minuscules
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  passwordSalt: text('password_salt').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
});

/* ------------------------------------------------------------------ *
 * Infrastructure locale.
 * ------------------------------------------------------------------ */

export const meta = sqliteTable('meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

/** File d'attente de sync (V2). Alimentée dès la V1 pour éviter la migration. */
export const syncQueue = sqliteTable(
  'sync_queue',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    entity: text('entity').notNull(),
    entityId: text('entity_id').notNull(),
    op: text('op').$type<SyncOp>().notNull(),
    payload: text('payload'), // JSON
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (t) => [index('idx_sync_queue_entity').on(t.entity, t.entityId)],
);

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

export type Region = 'chest' | 'back' | 'shoulders' | 'arms' | 'legs' | 'core';
export type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight';
export type Mechanic = 'compound' | 'isolation';
export type MuscleRole = 'primary' | 'secondary' | 'stabilizer';
export type SetType = 'warmup' | 'working' | 'dropset' | 'failure';
export type SyncOp = 'insert' | 'update' | 'delete';

export type Muscle = typeof muscle.$inferSelect;
export type Exercise = typeof exercise.$inferSelect;
export type ExerciseMuscle = typeof exerciseMuscle.$inferSelect;
export type Routine = typeof routine.$inferSelect;
export type RoutineItem = typeof routineItem.$inferSelect;
export type Session = typeof session.$inferSelect;
export type SessionExercise = typeof sessionExercise.$inferSelect;
export type SetLog = typeof setLog.$inferSelect;
export type ExerciseStats = typeof exerciseStats.$inferSelect;
export type User = typeof user.$inferSelect;
/** Ce que l'UI connaît du compte : jamais le hash. */
export type Account = Pick<User, 'id' | 'email' | 'displayName' | 'createdAt'>;

/** Un exercice avec ses muscles résolus — la forme utilisée par l'UI. */
export type ExerciseWithMuscles = Exercise & {
  muscles: { muscle: Muscle; role: MuscleRole }[];
};

/** Ce que l'écran de séance affiche pour chaque exercice. */
export type ExerciseInSession = {
  /** id de la ligne `session_exercise`, pas de l'exercice. */
  slotId: string;
  exercise: Exercise;
  targetSets: number;
  targetReps: string | null;
  restSeconds: number;
  supersetKey: string | null;
  /** Les séries de la dernière fois → le « poids précédent ». */
  lastTime: { sets: SetLog[]; sessionDate: string } | null;
  today: SetLog[];
};
