import { and, asc, desc, eq, gte, isNull, ne, sql } from 'drizzle-orm';

import { e1rm, tonnage, trend } from '../../lib/strength';
import type { Trend } from '../../lib/strength';
import { ROLE_WEIGHT, startOfLocalDaysAgo } from '../../lib/volume';
import { db } from '../client';
import { exercise, exerciseMuscle, exerciseStats, muscle, session, setLog } from '../schema';
import type { Muscle, Region, SetLog } from '../schema';

/* ------------------------------------------------------------------ *
 * Historique des séances
 * ------------------------------------------------------------------ */

export type SessionSummary = {
  id: string;
  routineName: string;
  startedAt: string;
  endedAt: string | null;
  durationMin: number | null;
  setCount: number;
  tonnage: number;
  prCount: number;
  exerciseCount: number;
};

/**
 * Agrégats par séance.
 *
 * Écrit en LEFT JOIN + GROUP BY plutôt qu'en sous-requêtes corrélées : dans un
 * `sql` brut sur une requête mono-table, drizzle rend `${session.id}` sans
 * qualifier la table (« "id" » et non « "session"."id" »). La sous-requête le
 * résolvait alors contre `set_log`, qui a aussi une colonne `id` — la condition
 * était donc toujours fausse, silencieusement, et tous les compteurs valaient 0.
 * Avec une jointure, les références de colonnes sont générées par drizzle.
 */
export function listSessions(limit = 100): SessionSummary[] {
  const rows = db
    .select({
      s: session,
      setCount: sql<number>`COUNT(CASE WHEN ${setLog.setType} <> 'warmup' THEN 1 END)`,
      tonnage: sql<number>`COALESCE(SUM(CASE WHEN ${setLog.setType} <> 'warmup'
        THEN ${setLog.weightKg} * ${setLog.reps} END), 0)`,
      // Un record = un exercice battu dans la séance, pas chaque série au-dessus.
      prCount: sql<number>`COUNT(DISTINCT CASE WHEN ${setLog.isPr} = 1 THEN ${setLog.exerciseId} END)`,
      exerciseCount: sql<number>`COUNT(DISTINCT ${setLog.exerciseId})`,
    })
    .from(session)
    .leftJoin(setLog, and(eq(setLog.sessionId, session.id), isNull(setLog.deletedAt)))
    .where(isNull(session.deletedAt))
    .groupBy(session.id)
    .orderBy(desc(session.startedAt))
    .limit(limit)
    .all();

  return rows.map((r) => ({
    id: r.s.id,
    routineName: r.s.routineName,
    startedAt: r.s.startedAt,
    endedAt: r.s.endedAt,
    durationMin: r.s.endedAt
      ? Math.round((Date.parse(r.s.endedAt) - Date.parse(r.s.startedAt)) / 60000)
      : null,
    setCount: r.setCount,
    tonnage: r.tonnage,
    prCount: r.prCount,
    exerciseCount: r.exerciseCount,
  }));
}

export function getSessionSummary(sessionId: string): SessionSummary | null {
  return listSessions(1000).find((s) => s.id === sessionId) ?? null;
}

export type SessionDetail = {
  summary: SessionSummary;
  exercises: { exerciseId: string; label: string; sets: SetLog[] }[];
};

export function getSessionDetail(sessionId: string): SessionDetail | null {
  const summary = getSessionSummary(sessionId);
  if (!summary) return null;

  const rows = db
    .select({ set: setLog, label: exercise.labelFr })
    .from(setLog)
    .innerJoin(exercise, eq(exercise.id, setLog.exerciseId))
    .where(and(eq(setLog.sessionId, sessionId), isNull(setLog.deletedAt)))
    .orderBy(asc(setLog.loggedAt), asc(setLog.setIndex))
    .all();

  const byExercise = new Map<string, { exerciseId: string; label: string; sets: SetLog[] }>();
  for (const r of rows) {
    const entry = byExercise.get(r.set.exerciseId) ?? {
      exerciseId: r.set.exerciseId,
      label: r.label,
      sets: [],
    };
    entry.sets.push(r.set);
    byExercise.set(r.set.exerciseId, entry);
  }
  return { summary, exercises: [...byExercise.values()] };
}

/* ------------------------------------------------------------------ *
 * Progression par exercice
 * ------------------------------------------------------------------ */

export type ExerciseProgressPoint = {
  sessionId: string;
  date: string;
  bestE1rm: number;
  topWeight: number;
  tonnage: number;
  sets: number;
};

export type ExerciseProgress = {
  points: ExerciseProgressPoint[];
  prWeightKg: number;
  prSetVolume: number;
  bestE1rm: number;
  bestSet: SetLog | null;
  totalSets: number;
  lastPerformedAt: string | null;
  trend: Trend;
};

export function getExerciseProgress(exerciseId: string): ExerciseProgress {
  const sets = db
    .select({ set: setLog, startedAt: session.startedAt })
    .from(setLog)
    .innerJoin(session, eq(session.id, setLog.sessionId))
    .where(
      and(
        eq(setLog.exerciseId, exerciseId),
        ne(setLog.setType, 'warmup'),
        isNull(setLog.deletedAt),
        isNull(session.deletedAt),
      ),
    )
    .orderBy(asc(session.startedAt), asc(setLog.setIndex))
    .all();

  const bySession = new Map<string, { date: string; sets: SetLog[] }>();
  for (const { set, startedAt } of sets) {
    const entry = bySession.get(set.sessionId) ?? { date: startedAt, sets: [] };
    entry.sets.push(set);
    bySession.set(set.sessionId, entry);
  }

  const points: ExerciseProgressPoint[] = [...bySession.entries()].map(([sessionId, e]) => ({
    sessionId,
    date: e.date,
    bestE1rm: Math.max(...e.sets.map((s) => e1rm(s.weightKg, s.reps))),
    topWeight: Math.max(...e.sets.map((s) => s.weightKg)),
    tonnage: tonnage(e.sets),
    sets: e.sets.length,
  }));

  const stats = db
    .select()
    .from(exerciseStats)
    .where(eq(exerciseStats.exerciseId, exerciseId))
    .get();

  let bestSet: SetLog | null = null;
  let bestValue = -1;
  for (const { set } of sets) {
    const v = e1rm(set.weightKg, set.reps);
    if (v > bestValue) {
      bestValue = v;
      bestSet = set;
    }
  }

  return {
    points,
    prWeightKg: stats?.bestWeightKg ?? 0,
    prSetVolume: stats?.bestSetVolume ?? 0,
    bestE1rm: stats?.bestE1rm ?? 0,
    bestSet,
    totalSets: stats?.totalSets ?? 0,
    lastPerformedAt: stats?.lastPerformedAt ?? null,
    // §6 : pente sur les 6 dernières séances.
    trend: trend(points.slice(-6).map((p) => p.bestE1rm)),
  };
}

/* ------------------------------------------------------------------ *
 * Volume hebdomadaire par muscle
 * ------------------------------------------------------------------ */

export type MuscleVolume = {
  muscle: Muscle;
  /** Séries pondérées : primary × 1, secondary × 0,5 (§6). */
  sets: number;
};

/**
 * Séries travaillées par muscle sur les N derniers jours.
 * La fenêtre est ancrée sur minuit **local** : une séance de 23 h compte pour
 * son jour local, pas pour le lendemain UTC (§11).
 */
export function getMuscleVolume(days = 7): MuscleVolume[] {
  const since = startOfLocalDaysAgo(days - 1).toISOString();

  const rows = db
    .select({
      m: muscle,
      role: exerciseMuscle.role,
      count: sql<number>`COUNT(*)`,
    })
    .from(setLog)
    .innerJoin(exerciseMuscle, eq(exerciseMuscle.exerciseId, setLog.exerciseId))
    .innerJoin(muscle, eq(muscle.id, exerciseMuscle.muscleId))
    .innerJoin(session, eq(session.id, setLog.sessionId))
    .where(
      and(
        gte(session.startedAt, since),
        ne(setLog.setType, 'warmup'),
        isNull(setLog.deletedAt),
        isNull(session.deletedAt),
      ),
    )
    .groupBy(muscle.id, exerciseMuscle.role)
    .all();

  const totals = new Map<string, MuscleVolume>();
  for (const m of db.select().from(muscle).all()) {
    totals.set(m.id, { muscle: m, sets: 0 });
  }
  for (const r of rows) {
    const entry = totals.get(r.m.id);
    if (entry) entry.sets += r.count * ROLE_WEIGHT[r.role];
  }

  return [...totals.values()].sort((a, b) => b.sets - a.sets);
}

export type RegionVolume = { region: Region; sets: number };

export function getRegionVolume(days = 7): RegionVolume[] {
  const byRegion = new Map<Region, number>();
  for (const v of getMuscleVolume(days)) {
    byRegion.set(v.muscle.region, (byRegion.get(v.muscle.region) ?? 0) + v.sets);
  }
  return [...byRegion.entries()]
    .map(([region, sets]) => ({ region, sets }))
    .sort((a, b) => b.sets - a.sets);
}

/* ------------------------------------------------------------------ *
 * Tableau de bord
 * ------------------------------------------------------------------ */

export type Dashboard = {
  sessionsThisWeek: number;
  setsThisWeek: number;
  tonnageThisWeek: number;
  prsThisMonth: number;
  streakWeeks: number;
};

export function getDashboard(): Dashboard {
  const weekAgo = startOfLocalDaysAgo(6).toISOString();
  const monthAgo = startOfLocalDaysAgo(29).toISOString();

  const week = db
    .select({
      sessions: sql<number>`COUNT(DISTINCT ${session.id})`,
      sets: sql<number>`COUNT(${setLog.id})`,
      tonnage: sql<number>`COALESCE(SUM(${setLog.weightKg} * ${setLog.reps}), 0)`,
    })
    .from(session)
    .leftJoin(
      setLog,
      and(eq(setLog.sessionId, session.id), isNull(setLog.deletedAt), ne(setLog.setType, 'warmup')),
    )
    .where(and(gte(session.startedAt, weekAgo), isNull(session.deletedAt)))
    .get();

  const prs = db
    .select({ n: sql<number>`COUNT(DISTINCT ${setLog.sessionId} || ${setLog.exerciseId})` })
    .from(setLog)
    .where(and(eq(setLog.isPr, true), gte(setLog.loggedAt, monthAgo), isNull(setLog.deletedAt)))
    .get();

  return {
    sessionsThisWeek: week?.sessions ?? 0,
    setsThisWeek: week?.sets ?? 0,
    tonnageThisWeek: week?.tonnage ?? 0,
    prsThisMonth: prs?.n ?? 0,
    streakWeeks: computeStreakWeeks(),
  };
}

/** Nombre de semaines consécutives (fenêtres de 7 j glissantes) avec ≥ 1 séance. */
function computeStreakWeeks(): number {
  const dates = db
    .select({ startedAt: session.startedAt })
    .from(session)
    .where(isNull(session.deletedAt))
    .orderBy(desc(session.startedAt))
    .all()
    .map((r) => Date.parse(r.startedAt));
  if (!dates.length) return 0;

  const WEEK = 7 * 86400_000;
  let streak = 0;
  let windowEnd = Date.now();
  while (dates.some((d) => d <= windowEnd && d > windowEnd - WEEK)) {
    streak += 1;
    windowEnd -= WEEK;
  }
  return streak;
}

/* ------------------------------------------------------------------ *
 * Profil — depuis le premier jour
 * ------------------------------------------------------------------ */

export type LifetimeStats = { sessions: number; tonnage: number; prs: number };

export function getLifetimeStats(): LifetimeStats {
  const totals = db
    .select({
      sessions: sql<number>`COUNT(DISTINCT ${session.id})`,
      tonnage: sql<number>`COALESCE(SUM(${setLog.weightKg} * ${setLog.reps}), 0)`,
      prs: sql<number>`COUNT(DISTINCT CASE WHEN ${setLog.isPr} = 1 THEN ${setLog.sessionId} || ${setLog.exerciseId} END)`,
    })
    .from(session)
    .leftJoin(
      setLog,
      and(eq(setLog.sessionId, session.id), isNull(setLog.deletedAt), ne(setLog.setType, 'warmup')),
    )
    .where(isNull(session.deletedAt))
    .get();

  return { sessions: totals?.sessions ?? 0, tonnage: totals?.tonnage ?? 0, prs: totals?.prs ?? 0 };
}
