import { and, desc, eq, gte, isNotNull, isNull, lt, max, ne, sql } from 'drizzle-orm';

import { e1rm } from '../../lib/strength';
import { bumpRevision, db } from '../client';
import { exercise, meta, session, setLog } from '../schema';
import { getRoutineItems, listRoutines } from './routines';
import { getDashboard, getSessionSummary, listSessions } from './stats';
import type { SessionSummary } from './stats';

/*
 * Ce qui fait revenir : un objectif de semaine qu'on voit se remplir, la
 * prochaine séance déjà choisie, et les records mis en avant au lieu d'être
 * noyés dans l'historique. Tout est dérivé de set_log / session, sauf
 * l'objectif lui-même, rangé dans `meta`.
 */

/* ------------------------------------------------------------------ *
 * Objectif hebdomadaire
 * ------------------------------------------------------------------ */

const GOAL_KEY = 'weekly_goal';
export const DEFAULT_WEEKLY_GOAL = 3;
export const WEEKLY_GOAL_RANGE = { min: 1, max: 7 } as const;

export function getWeeklyGoal(): number {
  const row = db.select().from(meta).where(eq(meta.key, GOAL_KEY)).get();
  const n = Number(row?.value);
  return Number.isInteger(n) && n >= WEEKLY_GOAL_RANGE.min ? n : DEFAULT_WEEKLY_GOAL;
}

export function setWeeklyGoal(n: number): void {
  const value = String(Math.max(WEEKLY_GOAL_RANGE.min, Math.min(WEEKLY_GOAL_RANGE.max, Math.round(n))));
  db.insert(meta)
    .values({ key: GOAL_KEY, value })
    .onConflictDoUpdate({ target: meta.key, set: { value } })
    .run();
  bumpRevision();
}

/** Lundi 0 h, heure locale (§11 : une séance de 23 h compte pour son jour local). */
export function startOfLocalWeek(now = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

export type WeekActivity = {
  goal: number;
  /** Séances terminées depuis lundi. */
  done: number;
  /** Lundi → dimanche : au moins une séance terminée ce jour-là. */
  days: boolean[];
  /** 0 = lundi. */
  todayIndex: number;
};

export function getWeekActivity(): WeekActivity {
  const start = startOfLocalWeek();
  const rows = db
    .select({ startedAt: session.startedAt })
    .from(session)
    .where(
      and(isNull(session.deletedAt), isNotNull(session.endedAt), gte(session.startedAt, start.toISOString())),
    )
    .all();

  const days = Array<boolean>(7).fill(false);
  for (const r of rows) {
    const i = Math.floor((new Date(r.startedAt).getTime() - start.getTime()) / 86_400_000);
    if (i >= 0 && i < 7) days[i] = true;
  }
  return {
    goal: getWeeklyGoal(),
    done: rows.length,
    days,
    todayIndex: (new Date().getDay() + 6) % 7,
  };
}

/* ------------------------------------------------------------------ *
 * Prochaine séance
 * ------------------------------------------------------------------ */

export type NextRoutine = {
  id: string;
  name: string;
  color: string | null;
  exerciseLabels: string[];
  totalSets: number;
  estimatedMin: number;
  lastDoneAt: string | null;
};

/**
 * Le modèle fait il y a le plus longtemps (ou jamais fait). Sur un split
 * Push / Pull / Legs, ça donne exactement la rotation : pas besoin de demander
 * à l'utilisateur de déclarer un programme.
 */
export function getNextRoutine(): NextRoutine | null {
  const routines = listRoutines().filter((r) => r.itemCount > 0);
  if (!routines.length) return null;

  const last = new Map(
    db
      .select({ routineId: session.routineId, at: max(session.startedAt) })
      .from(session)
      .where(and(isNull(session.deletedAt), isNotNull(session.routineId)))
      .groupBy(session.routineId)
      .all()
      .map((r) => [r.routineId, r.at] as const),
  );

  const pick = [...routines].sort((a, b) => {
    const la = last.get(a.id) ?? '';
    const lb = last.get(b.id) ?? '';
    // À égalité (programme tout juste installé), l'ordre de création : Push avant Legs.
    return la === lb ? a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id) : la < lb ? -1 : 1;
  })[0];

  const items = getRoutineItems(pick.id);
  const totalSets = items.reduce((n, i) => n + i.targetSets, 0);
  // ~40 s d'effort par série + le repos prévu.
  const seconds = items.reduce((n, i) => n + i.targetSets * (40 + (i.restSeconds ?? 120)), 0);

  return {
    id: pick.id,
    name: pick.name,
    color: pick.color,
    exerciseLabels: items.map((i) => i.exercise.labelFr),
    totalSets,
    estimatedMin: Math.max(5, Math.round(seconds / 60 / 5) * 5),
    lastDoneAt: last.get(pick.id) ?? null,
  };
}

/* ------------------------------------------------------------------ *
 * Records
 * ------------------------------------------------------------------ */

export type RecordHighlight = {
  exerciseId: string;
  label: string;
  weightKg: number;
  reps: number;
  e1rm: number;
  /** Gain d'e1RM par rapport au meilleur d'avant. Null pour une première fois. */
  gain: number | null;
  sessionId: string;
  loggedAt: string;
};

/** Meilleur e1RM de l'exercice avant un instant donné. */
function bestBefore(exerciseId: string, beforeIso: string): number {
  const row = db
    .select({ best: sql<number>`MAX(${setLog.weightKg} * (1 + ${setLog.reps} / 30.0))` })
    .from(setLog)
    .where(
      and(
        eq(setLog.exerciseId, exerciseId),
        isNull(setLog.deletedAt),
        ne(setLog.setType, 'warmup'),
        lt(setLog.loggedAt, beforeIso),
      ),
    )
    .get();
  return row?.best ?? 0;
}

/** Un record par (séance, exercice) : la meilleure série PR de la séance. */
function collapseRecords(
  rows: { set: typeof setLog.$inferSelect; label: string }[],
): RecordHighlight[] {
  const byKey = new Map<string, { set: typeof setLog.$inferSelect; label: string; firstAt: string }>();
  for (const r of rows) {
    const key = `${r.set.sessionId}:${r.set.exerciseId}`;
    const cur = byKey.get(key);
    const firstAt = cur && cur.firstAt < r.set.loggedAt ? cur.firstAt : r.set.loggedAt;
    if (!cur || e1rm(r.set.weightKg, r.set.reps) > e1rm(cur.set.weightKg, cur.set.reps)) {
      byKey.set(key, { ...r, firstAt });
    } else {
      cur.firstAt = firstAt;
    }
  }
  return [...byKey.values()].map(({ set, label, firstAt }) => {
    const value = e1rm(set.weightKg, set.reps);
    const before = bestBefore(set.exerciseId, firstAt);
    return {
      exerciseId: set.exerciseId,
      label,
      weightKg: set.weightKg,
      reps: set.reps,
      e1rm: value,
      gain: before > 0 ? value - before : null,
      sessionId: set.sessionId,
      loggedAt: set.loggedAt,
    };
  });
}

/** Les records récents, un par exercice, le plus récent d'abord. */
export function getRecentRecords(limit = 8, days = 30): RecordHighlight[] {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const rows = db
    .select({ set: setLog, label: exercise.labelFr })
    .from(setLog)
    .innerJoin(exercise, eq(exercise.id, setLog.exerciseId))
    .innerJoin(session, eq(session.id, setLog.sessionId))
    .where(
      and(
        eq(setLog.isPr, true),
        isNull(setLog.deletedAt),
        isNull(session.deletedAt),
        gte(setLog.loggedAt, since),
      ),
    )
    .orderBy(desc(setLog.loggedAt))
    .all();

  const seen = new Set<string>();
  return collapseRecords(rows)
    .sort((a, b) => (a.loggedAt < b.loggedAt ? 1 : -1))
    .filter((r) => !seen.has(r.exerciseId) && seen.add(r.exerciseId))
    .slice(0, limit);
}

/* ------------------------------------------------------------------ *
 * Bilan de fin de séance
 * ------------------------------------------------------------------ */

export type SessionRecap = {
  summary: SessionSummary;
  records: RecordHighlight[];
  /** Variation de tonnage vs la dernière fois que ce modèle a été fait. */
  tonnageDelta: { previous: number; ratio: number } | null;
  week: WeekActivity;
  streakWeeks: number;
  /** Rang de cette séance depuis le premier jour (« 18e séance »). */
  sessionNumber: number;
};

export function getSessionRecap(sessionId: string): SessionRecap | null {
  const summary = getSessionSummary(sessionId);
  if (!summary) return null;

  const rows = db
    .select({ set: setLog, label: exercise.labelFr })
    .from(setLog)
    .innerJoin(exercise, eq(exercise.id, setLog.exerciseId))
    .where(and(eq(setLog.sessionId, sessionId), eq(setLog.isPr, true), isNull(setLog.deletedAt)))
    .all();

  const all = listSessions(10_000).filter((s) => s.endedAt);
  const previous = all.find(
    (s) => s.routineName === summary.routineName && s.startedAt < summary.startedAt && s.tonnage > 0,
  );

  return {
    summary,
    records: collapseRecords(rows).sort((a, b) => (b.gain ?? 0) - (a.gain ?? 0)),
    tonnageDelta:
      previous && summary.tonnage > 0
        ? { previous: previous.tonnage, ratio: summary.tonnage / previous.tonnage - 1 }
        : null,
    week: getWeekActivity(),
    streakWeeks: getDashboard().streakWeeks,
    sessionNumber: all.filter((s) => s.startedAt <= summary.startedAt).length,
  };
}
