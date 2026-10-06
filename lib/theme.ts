/**
 * Thème sombre unique. L'app est utilisée en salle, souvent dans une lumière
 * pourrie, et les contrastes forts + grosses cibles priment.
 *
 * La hiérarchie vient des surfaces (bg → surface → surfaceAlt → surfaceHigh),
 * pas des bordures : une carte n'a de contour que si elle doit se détacher.
 * L'orange est réservé à l'action principale ; l'or aux records ; le vert à la
 * régularité (objectif, série de semaines). Une couleur = un sens.
 */
export const c = {
  bg: '#09090B',
  surface: '#131316',
  surfaceAlt: '#1B1B20',
  surfaceHigh: '#25252C',
  border: '#232329',
  borderStrong: '#34343D',

  text: '#FAFAFA',
  textDim: '#A1A1AA',
  textFaint: '#66666F',

  accent: '#FF5A36',
  /** Fond teinté derrière un élément accent (badge, avatar). */
  accentDim: '#3B1810',
  /** Dégradé des appels à l'action principaux et des héros. */
  accentGradient: ['#FF7A3D', '#FF3D57'] as const,

  pr: '#FFC542',
  prDim: '#3A2C0C',
  ok: '#34D399',
  okDim: '#0F3A2E',
  warn: '#FBBF24',
  info: '#60A5FA',
  infoDim: '#14294A',
  danger: '#F43F5E',
  dangerDim: '#3E1119',

  /** Palette du BodyMap (§4 du spec). */
  bodyBase: '#2A2A31',
  bodyMuscle: '#36363F',
  bodyPrimary: '#FF5A36',
  bodySecondary: '#F59E42',
  bodyStabilizer: '#FDE68A',

  /** Pastilles proposées à la création d'une séance. */
  routineColors: ['#FF5A36', '#60A5FA', '#34D399', '#A78BFA', '#FBBF24', '#F472B6'],
} as const;

export const radius = { sm: 8, md: 12, lg: 18, xl: 24, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** Cible tactile minimale : main moite, debout, entre deux séries. */
export const HIT = 44;

import type { TextStyle } from 'react-native';

/**
 * Familles chargées dans app/_layout.tsx. Inter pour l'interface, Barlow
 * Condensed pour ce qui doit se lire de loin : les chiffres et les noms de
 * séance. Le composant `Text` (components/Text.tsx) traduit `fontWeight` vers
 * la bonne famille Inter ; `display` s'utilise explicitement.
 */
export const ff = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  black: 'Inter_800ExtraBold',
  display: 'BarlowCondensed_700Bold',
} as const;

export const font: { tabular: TextStyle; display: TextStyle } = {
  /** Chiffres alignés — indispensable pour que les colonnes kg/reps ne dansent pas. */
  tabular: { fontVariant: ['tabular-nums'] },
  /** Gros chiffres et titres « sport ». */
  display: { fontFamily: ff.display, letterSpacing: 0.2 },
};

/** Échelle typographique. Les écrans composent à partir d'ici. */
export const type = {
  hero: { fontFamily: ff.display, fontSize: 44, lineHeight: 46, color: c.text },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.6, color: c.text },
  h2: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3, color: c.text },
  h3: { fontSize: 16, fontWeight: '600', color: c.text },
  body: { fontSize: 15, lineHeight: 21, color: c.textDim },
  small: { fontSize: 13, lineHeight: 18, color: c.textDim },
  caption: { fontSize: 12, color: c.textFaint },
  overline: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: c.textFaint },
} satisfies Record<string, TextStyle>;
