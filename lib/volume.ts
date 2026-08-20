import type { MuscleRole } from '../db/schema';

/**
 * Pondération d'une série selon le rôle du muscle (§6 du spec).
 * Les stabilisateurs ne comptent pas dans le volume hebdo : les inclure ferait
 * apparaître les lombaires « surentraînés » à chaque squat, ce qui n'aide pas.
 */
export const ROLE_WEIGHT: Record<MuscleRole, number> = {
  primary: 1,
  secondary: 0.5,
  stabilizer: 0,
};

/** Repère de référence pour l'hypertrophie : 10–20 séries travaillées / semaine. */
export const WEEKLY_TARGET = { low: 10, high: 20 } as const;

export type VolumeStatus = 'none' | 'low' | 'ok' | 'high';

export function volumeStatus(sets: number): VolumeStatus {
  if (sets <= 0) return 'none';
  if (sets < WEEKLY_TARGET.low) return 'low';
  if (sets <= WEEKLY_TARGET.high) return 'ok';
  return 'high';
}

/**
 * Intensité 0→1 pour la coloration du BodyMap, saturée au haut de la fourchette.
 * On ne veut pas qu'un groupe à 40 séries écrase visuellement tous les autres.
 */
export const volumeIntensity = (sets: number): number =>
  Math.max(0, Math.min(1, sets / WEEKLY_TARGET.high));

/**
 * Début de la fenêtre « 7 derniers jours », ancré sur le fuseau local (§11).
 * Une séance de 23 h doit compter pour son jour local, pas pour le jour UTC.
 */
export function startOfLocalDaysAgo(days: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d;
}
