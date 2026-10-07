import type { CardioActivity } from '../schema';

/**
 * Activités cardio livrées avec l'app (Lot 10). L'ordre du tableau est l'ordre
 * d'affichage. Rejoué par `runSeed` à chaque montée de `seed_version`.
 */
export const CARDIO_ACTIVITIES: Omit<CardioActivity, 'position'>[] = [
  // Salle
  { id: 'treadmill', labelFr: 'Tapis de course', setting: 'gym', icon: 'walk-outline', pace: 'per_km', levelLabel: 'Inclinaison (%)' },
  { id: 'stationary_bike', labelFr: "Vélo d'appartement", setting: 'gym', icon: 'bicycle-outline', pace: 'speed', levelLabel: 'Résistance' },
  { id: 'rower', labelFr: 'Rameur', setting: 'gym', icon: 'boat-outline', pace: 'per_500m', levelLabel: 'Résistance' },
  { id: 'elliptical', labelFr: 'Vélo elliptique', setting: 'gym', icon: 'sync-outline', pace: 'speed', levelLabel: 'Résistance' },
  { id: 'stair_climber', labelFr: 'Stepper / escalier', setting: 'gym', icon: 'trending-up-outline', pace: null, levelLabel: 'Niveau' },
  { id: 'skierg', labelFr: 'SkiErg', setting: 'gym', icon: 'snow-outline', pace: 'per_500m', levelLabel: 'Résistance' },
  { id: 'jump_rope', labelFr: 'Corde à sauter', setting: 'gym', icon: 'pulse-outline', pace: null, levelLabel: null },
  // Extérieur
  { id: 'run', labelFr: 'Course à pied', setting: 'outdoor', icon: 'footsteps-outline', pace: 'per_km', levelLabel: null },
  { id: 'cycling', labelFr: 'Vélo', setting: 'outdoor', icon: 'bicycle-outline', pace: 'speed', levelLabel: null },
  { id: 'walk', labelFr: 'Marche', setting: 'outdoor', icon: 'walk-outline', pace: 'per_km', levelLabel: null },
];
