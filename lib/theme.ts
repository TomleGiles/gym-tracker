/**
 * Thème sombre unique. L'app est utilisée en salle, souvent dans une lumière
 * pourrie, et les contrastes forts + grosses cibles priment sur l'élégance.
 */
export const c = {
  bg: '#0B0D10',
  surface: '#151920',
  surfaceAlt: '#1D222B',
  border: '#272D38',
  borderStrong: '#39404D',

  text: '#F2F5F9',
  textDim: '#98A2B3',
  textFaint: '#5C6675',

  accent: '#FF5A36',
  accentDim: '#7A2A1A',
  ok: '#34D399',
  okDim: '#12433A',
  warn: '#FBBF24',
  info: '#60A5FA',

  /** Palette du BodyMap (§4 du spec). */
  bodyBase: '#2E343D',
  bodyMuscle: '#39404A',
  bodyPrimary: '#FF5A36',
  bodySecondary: '#F59E42',
  bodyStabilizer: '#FDE68A',

  /** Pastilles proposées à la création d'une séance. */
  routineColors: ['#FF5A36', '#60A5FA', '#34D399', '#A78BFA', '#FBBF24', '#F472B6'],
} as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** Cible tactile minimale : main moite, debout, entre deux séries. */
export const HIT = 44;

import type { TextStyle } from 'react-native';

export const font: { tabular: TextStyle } = {
  /** Chiffres alignés — indispensable pour que les colonnes kg/reps ne dansent pas. */
  tabular: { fontVariant: ['tabular-nums'] },
};
