/** Formatage FR. Tout est stocké en UTC ISO et affiché en heure locale (§11). */

const DAY = 86_400_000;

/** Nombre de jours calendaires locaux entre une date ISO et aujourd'hui. */
export function daysAgo(iso: string): number {
  const then = new Date(iso);
  then.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - then.getTime()) / DAY);
}

export function relativeDay(iso: string): string {
  const d = daysAgo(iso);
  if (d <= 0) return "aujourd'hui";
  if (d === 1) return 'hier';
  if (d < 7) return `il y a ${d} j`;
  if (d < 14) return 'la semaine dernière';
  if (d < 60) return `il y a ${Math.round(d / 7)} sem.`;
  return `il y a ${Math.round(d / 30)} mois`;
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

export function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/** 95 → « 1 h 35 », 42 → « 42 min ». */
export function duration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

/** 125 → « 2:05 ». Pour le chrono de repos. */
export function mmss(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** 12480 → « 12,5 t ». Le tonnage en kg devient vite illisible. */
export function tonnageLabel(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toFixed(1).replace('.', ',')} t`;
  return `${Math.round(kg)} kg`;
}

export const plural = (n: number, one: string, many = `${one}s`): string =>
  `${n} ${n > 1 ? many : one}`;

export const EQUIPMENT_LABEL: Record<string, string> = {
  barbell: 'Barre',
  dumbbell: 'Haltères',
  machine: 'Machine',
  cable: 'Poulie',
  bodyweight: 'Poids du corps',
};

export const REGION_LABEL: Record<string, string> = {
  chest: 'Pectoraux',
  back: 'Dos',
  shoulders: 'Épaules',
  arms: 'Bras',
  legs: 'Jambes',
  core: 'Abdos',
};

export const SET_TYPE_LABEL: Record<string, string> = {
  warmup: 'Échauffement',
  working: 'Série de travail',
  dropset: 'Dropset',
  failure: 'Échec',
};
