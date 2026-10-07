/**
 * Thème sombre unique. L'app est utilisée en salle, souvent dans une lumière
 * pourrie, et les contrastes forts + grosses cibles priment.
 *
 * La hiérarchie vient des surfaces (bg → surface → surfaceAlt → surfaceHigh),
 * pas des bordures : une carte n'a de contour que si elle doit se détacher.
 * L'ivoire est réservé à l'action principale ; l'or aux records ; le vert à la
 * régularité (objectif, série de semaines). Une couleur = un sens.
 */
export const c = {
  bg: '#0B0E11',
  surface: '#14181D',
  surfaceAlt: '#1C2127',
  surfaceHigh: '#272E35',
  border: '#282E35',
  borderStrong: '#414B55',

  text: '#F4F6F8',
  textDim: '#A9B2BB',
  textFaint: '#87929E',

  accent: '#ECE4D4',
  onAccent: '#1A1712',
  /** Fond teinté derrière un élément accent (badge, avatar). */
  accentDim: '#2A2721',
  /** Dégradé des appels à l'action principaux et des héros. */
  accentGradient: ['#F4EEE3', '#E2D8C6'] as const,

  pr: '#FFC542',
  prDim: '#3A2C0C',
  ok: '#34D399',
  okDim: '#0F3A2E',
  warn: '#FBBF24',
  info: '#60A5FA',
  infoDim: '#14294A',
  danger: '#F43F5E',
  dangerDim: '#3E1119',

  /**
   * Palette du BodyMap (§4 du spec). Indépendante de l'accent : le dégradé
   * d'intensité (BodyMap.tsx) passe par ces trois couleurs et doit changer de
   * teinte pour se lire comme une chaleur. Braise, puis chauffé à blanc.
   */
  bodyBase: '#242C33',
  bodyMuscle: '#3A454E',
  bodyPrimary: '#F7D8B5',
  bodySecondary: '#E0693A',
  bodyStabilizer: '#7A3524',

  /** Pastilles proposées à la création d'une séance. */
  routineColors: ['#ECE4D4', '#8AB8FB', '#6EDCB4', '#BAA4F4', '#EAC37A', '#F2A0BA'],
} as const;

export const radius = { sm: 8, md: 12, lg: 20, xl: 28, pill: 999 } as const;
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
  title: { fontSize: 32, fontWeight: '800', letterSpacing: -1.2, color: c.text },
  h2: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3, color: c.text },
  h3: { fontSize: 16, fontWeight: '600', color: c.text },
  body: { fontSize: 15, lineHeight: 21, color: c.textDim },
  small: { fontSize: 13, lineHeight: 18, color: c.textDim },
  caption: { fontSize: 12, color: c.textFaint },
  overline: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: c.textFaint },
} satisfies Record<string, TextStyle>;
