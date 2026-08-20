import type { SetLog } from '../db/schema';

/**
 * 1RM estimé — formule d'Epley. Fiable jusqu'à ~10 reps, au-delà elle
 * surestime ; on l'affiche donc toujours comme une estimation.
 */
export const e1rm = (weightKg: number, reps: number): number =>
  reps <= 1 ? weightKg : weightKg * (1 + reps / 30);

/** Les séries qui comptent pour le volume : l'échauffement n'est pas du travail. */
export const isWorkingSet = (s: Pick<SetLog, 'setType'>): boolean => s.setType !== 'warmup';

/** Tonnage : somme des kg × reps sur les séries de travail. */
export const tonnage = (sets: Pick<SetLog, 'setType' | 'weightKg' | 'reps'>[]): number =>
  sets.filter(isWorkingSet).reduce((acc, s) => acc + s.weightKg * s.reps, 0);

/** Meilleure série au sens du 1RM estimé. */
export function bestSet<T extends Pick<SetLog, 'setType' | 'weightKg' | 'reps'>>(
  sets: T[],
): T | null {
  let best: T | null = null;
  let bestValue = -1;
  for (const s of sets) {
    if (!isWorkingSet(s)) continue;
    const v = e1rm(s.weightKg, s.reps);
    if (v > bestValue) {
      bestValue = v;
      best = s;
    }
  }
  return best;
}

export type Trend = 'up' | 'flat' | 'down';

/**
 * Tendance sur les N dernières séances : pente d'une régression linéaire sur le
 * meilleur e1RM de chaque séance, exprimée en % de la moyenne pour rester
 * comparable entre un curl et un squat.
 */
export function trend(e1rmBySession: number[], flatThresholdPct = 0.5): Trend {
  const n = e1rmBySession.length;
  if (n < 3) return 'flat';

  const meanX = (n - 1) / 2;
  const meanY = e1rmBySession.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (e1rmBySession[i] - meanY);
    den += (i - meanX) ** 2;
  }
  if (den === 0 || meanY === 0) return 'flat';

  const slopePctPerSession = ((num / den) / meanY) * 100;
  if (slopePctPerSession > flatThresholdPct) return 'up';
  if (slopePctPerSession < -flatThresholdPct) return 'down';
  return 'flat';
}

/** Arrondi d'affichage : 82.5 reste 82,5, 80.0 devient 80. */
export const fmtKg = (kg: number): string =>
  (Math.round(kg * 10) / 10).toString().replace('.', ',');

export const fmtE1rm = (kg: number): string => `${Math.round(kg)} kg`;

/** Le pas d'incrément le plus utile selon le matériel. */
export const weightStep = (equipment: string): number =>
  equipment === 'dumbbell' ? 2 : equipment === 'machine' || equipment === 'cable' ? 5 : 2.5;
