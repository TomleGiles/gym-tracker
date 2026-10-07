import { and, asc, desc, eq, inArray, isNull, max, ne } from 'drizzle-orm';

import { cardioRecords, speedOf, timerDistance, timerElapsed } from '../../lib/cardio';
import type { CardioRecordKind, CardioTimer } from '../../lib/cardio';
import { nowIso, uuidv7 } from '../../lib/id';
import { bumpRevision, db } from '../client';
import { cardioActivity, cardioLog, meta, session } from '../schema';
import type { CardioActivity, CardioLog } from '../schema';
import { queueOp } from './sync';

/*
 * La partie cardio d'une séance (Lot 10). Le cardio vient après la muscu :
 * une ligne par activité, faite d'une traite. Les volumes sont minuscules
 * (une ou deux lignes par séance), donc les records se calculent à la volée
 * au lieu d'être matérialisés comme `exercise_stats`.
 */

export function listCardioActivities(): CardioActivity[] {
  return db.select().from(cardioActivity).orderBy(asc(cardioActivity.position)).all();
}

export type CardioEntry = CardioLog & { activity: CardioActivity; records: CardioRecordKind[] };

/** Le cardio d'une séance, avec les records que chaque ligne a battus. */
export function getSessionCardio(sessionId: string): CardioEntry[] {
  const rows = db
    .select({ log: cardioLog, activity: cardioActivity })
    .from(cardioLog)
    .innerJoin(cardioActivity, eq(cardioActivity.id, cardioLog.activityId))
    .where(and(eq(cardioLog.sessionId, sessionId), isNull(cardioLog.deletedAt)))
    .orderBy(asc(cardioLog.position))
    .all();
  if (!rows.length) return [];

  const history = logsOf([...new Set(rows.map((r) => r.log.activityId))]);
  return rows.map(({ log, activity }) => ({
    ...log,
    activity,
    records: cardioRecords(
      log,
      history.filter((h) => h.activityId === log.activityId && h.loggedAt < log.loggedAt),
    ),
  }));
}

function logsOf(activityIds: string[]): CardioLog[] {
  if (!activityIds.length) return [];
  return db
    .select()
    .from(cardioLog)
    .where(and(inArray(cardioLog.activityId, activityIds), isNull(cardioLog.deletedAt)))
    .all();
}

/** La dernière fois sur cette activité, pour pré-remplir la saisie. */
export function getLastCardio(activityId: string, excludeSessionId?: string): CardioLog | null {
  const where = [eq(cardioLog.activityId, activityId), isNull(cardioLog.deletedAt)];
  if (excludeSessionId) where.push(ne(cardioLog.sessionId, excludeSessionId));
  return (
    db
      .select()
      .from(cardioLog)
      .where(and(...where))
      .orderBy(desc(cardioLog.loggedAt))
      .limit(1)
      .get() ?? null
  );
}

export type CardioInput = {
  durationSec: number;
  distanceM?: number | null;
  calories?: number | null;
  level?: number | null;
};

export function addCardio(sessionId: string, activityId: string, input: CardioInput): string {
  const id = uuidv7();
  const ts = nowIso();
  db.transaction((tx) => {
    const last = tx
      .select({ p: max(cardioLog.position) })
      .from(cardioLog)
      .where(and(eq(cardioLog.sessionId, sessionId), isNull(cardioLog.deletedAt)))
      .get();
    const row = {
      id,
      sessionId,
      activityId,
      position: (last?.p ?? -1) + 1,
      durationSec: input.durationSec,
      distanceM: input.distanceM ?? null,
      calories: input.calories ?? null,
      level: input.level ?? null,
      loggedAt: ts,
      updatedAt: ts,
    };
    tx.insert(cardioLog).values(row).run();
    tx.update(session).set({ updatedAt: ts }).where(eq(session.id, sessionId)).run();
    queueOp(tx, 'cardio_log', id, 'insert', row);
  });
  bumpRevision();
  return id;
}

export function updateCardio(id: string, input: CardioInput): void {
  const patch = {
    durationSec: input.durationSec,
    distanceM: input.distanceM ?? null,
    calories: input.calories ?? null,
    level: input.level ?? null,
  };
  db.transaction((tx) => {
    tx.update(cardioLog).set({ ...patch, updatedAt: nowIso() }).where(eq(cardioLog.id, id)).run();
    queueOp(tx, 'cardio_log', id, 'update', patch);
  });
  bumpRevision();
}

export function deleteCardio(id: string): void {
  const ts = nowIso();
  db.transaction((tx) => {
    tx.update(cardioLog).set({ deletedAt: ts, updatedAt: ts }).where(eq(cardioLog.id, id)).run();
    queueOp(tx, 'cardio_log', id, 'delete');
  });
  bumpRevision();
}

/* ------------------------------------------------------------------ *
 * Agrégats
 * ------------------------------------------------------------------ */

export type CardioTotals = { durationSec: number; distanceM: number; count: number };

/**
 * Totaux cardio par séance. Requête à part plutôt qu'un second LEFT JOIN dans
 * `listSessions` : joindre set_log *et* cardio_log multiplierait les lignes et
 * fausserait tonnage et compteurs.
 */
export function cardioTotalsBySession(): Map<string, CardioTotals> {
  const out = new Map<string, CardioTotals>();
  const rows = db
    .select({ sessionId: cardioLog.sessionId, durationSec: cardioLog.durationSec, distanceM: cardioLog.distanceM })
    .from(cardioLog)
    .where(isNull(cardioLog.deletedAt))
    .all();
  for (const r of rows) {
    const t = out.get(r.sessionId) ?? { durationSec: 0, distanceM: 0, count: 0 };
    t.durationSec += r.durationSec;
    t.distanceM += r.distanceM ?? 0;
    t.count += 1;
    out.set(r.sessionId, t);
  }
  return out;
}

export type CardioActivityStats = {
  activity: CardioActivity;
  count: number;
  lastAt: string | null;
  bestDurationSec: number;
  bestDistanceM: number;
  /** m/s ; null tant qu'aucune distance n'a été saisie. */
  bestSpeed: number | null;
};

/** Bibliothèque cardio : chaque activité avec ses records. */
export function getCardioActivityStats(): CardioActivityStats[] {
  const activities = listCardioActivities();
  const logs = db
    .select({ log: cardioLog })
    .from(cardioLog)
    .innerJoin(session, eq(session.id, cardioLog.sessionId))
    .where(and(isNull(cardioLog.deletedAt), isNull(session.deletedAt)))
    .all()
    .map((r) => r.log);

  return activities.map((activity) => {
    const mine = logs.filter((l) => l.activityId === activity.id);
    const speeds = mine.map(speedOf).filter((s): s is number => s !== null);
    return {
      activity,
      count: mine.length,
      lastAt: mine.reduce<string | null>((acc, l) => (!acc || l.loggedAt > acc ? l.loggedAt : acc), null),
      bestDurationSec: Math.max(0, ...mine.map((l) => l.durationSec)),
      bestDistanceM: Math.max(0, ...mine.map((l) => l.distanceM ?? 0)),
      bestSpeed: speeds.length ? Math.max(...speeds) : null,
    };
  });
}

/* ------------------------------------------------------------------ *
 * Chrono de cardio
 * ------------------------------------------------------------------ */

/**
 * Le chrono en cours, rangé dans `meta` : un état d'appareil, pas une donnée
 * synchronisée. En base plutôt qu'en mémoire, parce qu'un cardio de 30 min
 * doit survivre à un rechargement de la page ou à un kill de l'app.
 */
const TIMER_KEY = 'cardio_timer';

export function getCardioTimer(): CardioTimer | null {
  const row = db.select().from(meta).where(eq(meta.key, TIMER_KEY)).get();
  if (!row) return null;
  try {
    return JSON.parse(row.value) as CardioTimer;
  } catch {
    return null;
  }
}

export function saveCardioTimer(timer: CardioTimer | null): void {
  if (!timer) {
    db.delete(meta).where(eq(meta.key, TIMER_KEY)).run();
  } else {
    const value = JSON.stringify(timer);
    db.insert(meta).values({ key: TIMER_KEY, value }).onConflictDoUpdate({ target: meta.key, set: { value } }).run();
  }
  bumpRevision();
}

/**
 * Arrête le chrono et enregistre le cardio fait jusque-là. Rien n'est
 * enregistré sous 10 s : c'est un faux départ, pas une activité.
 */
export function finishCardioTimer(now = Date.now()): string | null {
  const timer = getCardioTimer();
  if (!timer) return null;
  const durationSec = Math.round(timerElapsed(timer, now));
  const distanceM = timerDistance(timer, now);
  saveCardioTimer(null);
  if (durationSec < 10) return null;
  return addCardio(timer.sessionId, timer.activityId, {
    durationSec,
    distanceM: distanceM > 0 ? Math.round(distanceM) : null,
    level: timer.level,
  });
}

