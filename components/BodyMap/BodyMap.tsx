import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';

import type { Muscle, MuscleRole } from '../../db/schema';
import { c } from '../../lib/theme';
import { BACK, FRONT, MIRROR_TRANSFORM } from './paths.generated';
import type { BodyGeometry } from './paths.generated';

/**
 * Une valeur de surlignage :
 *  - un rôle (fiche exercice) → couleur fixe de la palette ;
 *  - un nombre 0→1 (aperçu de séance, vue hebdo) → dégradé d'intensité.
 */
export type HighlightValue = MuscleRole | number;

export type BodyMapProps = {
  /** Clés = `muscle.svg_front_id` / `svg_back_id`. */
  highlights: Record<string, HighlightValue>;
  view?: 'front' | 'back' | 'both';
  /** Largeur d'**une** silhouette, en points. */
  size?: number;
  /** Les stabilisateurs encombrent plus qu'ils n'informent : masqués par défaut. */
  showStabilizers?: boolean;
};

const ROLE_COLOR: Record<MuscleRole, string> = {
  primary: c.bodyPrimary,
  secondary: c.bodySecondary,
  stabilizer: c.bodyStabilizer,
};

/** Dégradé du neutre au rouge saturé, en passant par jaune puis orange. */
const RAMP = [c.bodyMuscle, c.bodyStabilizer, c.bodySecondary, c.bodyPrimary] as const;

function rampColor(t: number): string {
  const x = Math.max(0, Math.min(1, t)) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(x));
  return mix(RAMP[i], RAMP[i + 1], x - i);
}

function mix(from: string, to: string, t: number): string {
  const a = parseInt(from.slice(1), 16);
  const b = parseInt(to.slice(1), 16);
  const ch = (shift: number) => {
    const va = (a >> shift) & 0xff;
    const vb = (b >> shift) & 0xff;
    return Math.round(va + (vb - va) * t);
  };
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

function fillFor(value: HighlightValue | undefined, showStabilizers: boolean): string {
  if (value === undefined) return c.bodyMuscle;
  if (typeof value === 'number') return value <= 0 ? c.bodyMuscle : rampColor(value);
  if (value === 'stabilizer' && !showStabilizers) return c.bodyMuscle;
  return ROLE_COLOR[value];
}

function BodyView({
  geometry,
  highlights,
  size,
  showStabilizers,
}: {
  geometry: BodyGeometry;
  highlights: Record<string, HighlightValue>;
  size: number;
  showStabilizers: boolean;
}) {
  const [, , vbW, vbH] = geometry.viewBox.split(' ').map(Number);
  const height = (size * vbH) / vbW;

  // Les chemins miroir partagent tous la même transformation : on les regroupe
  // sous un seul <G> plutôt que d'en poser une par <Path>.
  const layers = useMemo(() => {
    const straight: { id: string; d: string }[] = [];
    const mirrored: { id: string; d: string }[] = [];
    for (const [id, paths] of Object.entries(geometry.muscles)) {
      for (const p of paths) (p.mirror ? mirrored : straight).push({ id, d: p.d });
    }
    return { straight, mirrored };
  }, [geometry]);

  const renderMuscle = ({ id, d }: { id: string; d: string }, i: number) => (
    <Path key={`${id}-${i}`} d={d} fill={fillFor(highlights[id], showStabilizers)} />
  );

  return (
    <Svg width={size} height={height} viewBox={geometry.viewBox}>
      <G>
        {geometry.base.map((p, i) =>
          p.mirror ? null : <Path key={`b${i}`} d={p.d} fill={c.bodyBase} />,
        )}
      </G>
      <G transform={MIRROR_TRANSFORM}>
        {geometry.base.map((p, i) =>
          p.mirror ? <Path key={`bm${i}`} d={p.d} fill={c.bodyBase} /> : null,
        )}
      </G>

      <G>{layers.straight.map(renderMuscle)}</G>
      <G transform={MIRROR_TRANSFORM}>{layers.mirrored.map(renderMuscle)}</G>

      <G>
        {geometry.detail.map((d, i) => (
          <Path
            key={`d${i}`}
            d={d}
            fill="none"
            stroke={c.bg}
            strokeOpacity={0.4}
            strokeWidth={1.4}
            strokeLinecap="round"
          />
        ))}
      </G>
    </Svg>
  );
}

/**
 * Le « petit bonhomme ». Un seul composant pour les trois usages du §4 :
 * fiche exercice (rôles), aperçu de séance et vue hebdo (intensités).
 */
export const BodyMap = memo(function BodyMap({
  highlights,
  view = 'both',
  size = 150,
  showStabilizers = false,
}: BodyMapProps) {
  const views = view === 'both' ? ([FRONT, BACK] as const) : view === 'front' ? [FRONT] : [BACK];
  return (
    <View style={styles.row}>
      {views.map((geometry, i) => (
        <BodyView
          key={i}
          geometry={geometry}
          highlights={highlights}
          size={size}
          showStabilizers={showStabilizers}
        />
      ))}
    </View>
  );
});

/* ------------------------------------------------------------------ *
 * Passerelles muscle → id SVG
 * ------------------------------------------------------------------ */

/** Fiche exercice : un rôle par muscle. Le rôle le plus fort l'emporte. */
export function highlightsFromRoles(
  muscles: { muscle: Muscle; role: MuscleRole }[],
): Record<string, HighlightValue> {
  const rank: Record<MuscleRole, number> = { stabilizer: 0, secondary: 1, primary: 2 };
  const out: Record<string, MuscleRole> = {};
  for (const { muscle, role } of muscles) {
    for (const id of [muscle.svgFrontId, muscle.svgBackId]) {
      if (!id) continue;
      if (!out[id] || rank[role] > rank[out[id]]) out[id] = role;
    }
  }
  return out;
}

/** Aperçu de séance / vue hebdo : une intensité 0→1 par muscle. */
export function highlightsFromIntensities(
  entries: { muscle: Muscle; intensity: number }[],
): Record<string, HighlightValue> {
  const out: Record<string, number> = {};
  for (const { muscle, intensity } of entries) {
    for (const id of [muscle.svgFrontId, muscle.svgBackId]) {
      if (!id) continue;
      out[id] = Math.max(out[id] ?? 0, intensity);
    }
  }
  return out;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 4, alignItems: 'flex-start' },
});
