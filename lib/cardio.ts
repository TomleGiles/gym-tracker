import type { CardioActivity, CardioLog, CardioPace } from '../db/schema';

/** Formatage et records du cardio (Lot 10). Pur : aucun accès à la base. */

/** 1530 → « 25 min 30 s », 1500 → « 25 min », 3900 → « 1 h 05 ». */
export function cardioDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  if (s >= 3600) {
    const h = Math.floor(s / 3600);
    const m = Math.round((s % 3600) / 60);
    return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
  }
  const m = Math.floor(s / 60);
  const rest = s % 60;
  if (!m) return `${rest} s`;
  return rest ? `${m} min ${String(rest).padStart(2, '0')} s` : `${m} min`;
}

/** 4250 → « 4,25 km », 800 → « 800 m ». */
export function cardioDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  const km = Math.round(m / 10) / 100;
  return `${String(km).replace('.', ',')} km`;
}

/** Vitesse moyenne en m/s : l'unité commune pour comparer les allures. */
export function speedOf(log: { durationSec: number; distanceM?: number | null }): number | null {
  if (!log.distanceM || log.distanceM <= 0 || log.durationSec <= 0) return null;
  return log.distanceM / log.durationSec;
}

const minSec = (sec: number) => {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}'${String(s % 60).padStart(2, '0')}`;
};

/** L'allure telle qu'on la lit sur la machine : 5'30 /km, 1'52 /500 m, 28,4 km/h. */
export function cardioPace(pace: CardioPace | null, speed: number | null): string | null {
  if (!pace || !speed) return null;
  if (pace === 'per_km') return `${minSec(1000 / speed)} /km`;
  if (pace === 'per_500m') return `${minSec(500 / speed)} /500 m`;
  return `${(Math.round(speed * 36) / 10).toString().replace('.', ',')} km/h`;
}

/** Le rameur et le SkiErg affichent des mètres ; le reste, des kilomètres. */
export const distanceInMeters = (pace: CardioPace | null) => pace === 'per_500m';

/** Une ligne résumée : « 25 min · 4,25 km · 5'53 /km ». */
export function cardioSummary(activity: Pick<CardioActivity, 'pace'>, log: Pick<CardioLog, 'durationSec' | 'distanceM' | 'calories'>): string {
  return [
    cardioDuration(log.durationSec),
    log.distanceM ? cardioDistance(log.distanceM) : null,
    cardioPace(activity.pace, speedOf(log)),
    log.calories ? `${log.calories} kcal` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export type CardioRecordKind = 'duration' | 'distance' | 'pace';

export const CARDIO_RECORD_LABEL: Record<CardioRecordKind, string> = {
  duration: 'Plus long',
  distance: 'Plus loin',
  pace: 'Plus rapide',
};

/**
 * Les records battus par `log` face aux activités *antérieures* du même type.
 * La toute première fois n'est pas un record : sinon chaque nouvelle activité
 * en afficherait trois d'un coup, et le mot ne voudrait plus rien dire.
 */
export function cardioRecords(
  log: Pick<CardioLog, 'durationSec' | 'distanceM'>,
  earlier: Pick<CardioLog, 'durationSec' | 'distanceM'>[],
): CardioRecordKind[] {
  if (!earlier.length) return [];
  const out: CardioRecordKind[] = [];
  if (log.durationSec > Math.max(...earlier.map((e) => e.durationSec))) out.push('duration');

  const withDistance = earlier.filter((e) => e.distanceM);
  if (log.distanceM && withDistance.length) {
    if (log.distanceM > Math.max(...withDistance.map((e) => e.distanceM ?? 0))) out.push('distance');
    const speed = speedOf(log);
    const best = Math.max(...withDistance.map((e) => speedOf(e) ?? 0));
    if (speed && speed > best) out.push('pace');
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Chrono de cardio
 * ------------------------------------------------------------------ */

/**
 * Un cardio lancé au chrono. On stocke des segments, pas un décompte : le
 * temps écoulé se recalcule depuis `runningSince`, donc le chrono reste juste
 * après une mise en veille ou un rechargement. Changer de vitesse referme le
 * segment en cours pour que la distance estimée suive la bonne allure.
 */
export type CardioTimer = {
  sessionId: string;
  activityId: string;
  targetSec: number;
  /** km/h affichés par la machine. NULL = pas de distance estimée. */
  speedKmh: number | null;
  level: number | null;
  /** Temps et distance des segments déjà refermés. */
  doneSec: number;
  doneM: number;
  /** Epoch ms du début du segment en cours ; NULL = en pause. */
  runningSince: number | null;
  notificationId: string | null;
};

/** Secondes écoulées, plafonnées à la cible. */
export function timerElapsed(t: CardioTimer, now: number): number {
  const live = t.runningSince === null ? 0 : (now - t.runningSince) / 1000;
  return Math.min(t.targetSec, t.doneSec + Math.max(0, live));
}

/** Distance estimée d'après la vitesse saisie, en mètres. */
export function timerDistance(t: CardioTimer, now: number): number {
  if (t.runningSince === null || !t.speedKmh) return t.doneM;
  return t.doneM + ((timerElapsed(t, now) - t.doneSec) * t.speedKmh) / 3.6;
}

/** Referme le segment en cours : le point de départ de toute modification. */
function closeSegment(t: CardioTimer, now: number): CardioTimer {
  return { ...t, doneSec: timerElapsed(t, now), doneM: timerDistance(t, now), runningSince: null };
}

export const pauseTimer = (t: CardioTimer, now: number): CardioTimer => closeSegment(t, now);

export const resumeTimer = (t: CardioTimer, now: number): CardioTimer =>
  t.runningSince === null ? { ...t, runningSince: now } : t;

export function setTimerSpeed(t: CardioTimer, speedKmh: number | null, now: number): CardioTimer {
  const running = t.runningSince !== null;
  const closed = closeSegment(t, now);
  return { ...closed, speedKmh, runningSince: running ? now : null };
}

export const extendTimer = (t: CardioTimer, seconds: number): CardioTimer => ({ ...t, targetSec: t.targetSec + seconds });

/** Secondes jusqu'à la fin si le chrono tourne, pour la notification. */
export const timerRemaining = (t: CardioTimer, now: number): number => Math.max(0, t.targetSec - timerElapsed(t, now));
