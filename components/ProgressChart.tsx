import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { Text } from './Text';
import { shortDate } from '../lib/format';
import { c, font, radius, space } from '../lib/theme';

export type ChartPoint = { date: string; value: number };

/**
 * Courbe de charge. Écrit à la main en react-native-svg plutôt qu'avec
 * victory-native : celui-ci repose sur Skia, dont le portage web tire un
 * CanvasKit WASM de plusieurs Mo — inacceptable pour une seule sparkline, et
 * incompatible avec l'objectif « même code partout » du §2.
 */
export function ProgressChart({
  points,
  height = 170,
  unit = 'kg',
}: {
  points: ChartPoint[];
  height?: number;
  unit?: string;
}) {
  const [width, setWidth] = useState(0);
  const onLayout = useCallback((e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width), []);

  const geom = useMemo(() => {
    if (points.length < 2 || !width) return null;

    const padL = 34;
    const padR = 10;
    const padT = 12;
    const padB = 22;
    const w = width - padL - padR;
    const h = height - padT - padB;

    const values = points.map((p) => p.value);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    // Un plateau parfait ne doit pas devenir une ligne collée au bord.
    const pad = Math.max((rawMax - rawMin) * 0.15, rawMax * 0.03, 1);
    const min = Math.max(0, rawMin - pad);
    const max = rawMax + pad;

    const x = (i: number) => padL + (i / (points.length - 1)) * w;
    const y = (v: number) => padT + h - ((v - min) / (max - min)) * h;

    const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
    const area = `${line} L${x(points.length - 1).toFixed(1)},${padT + h} L${padL},${padT + h} Z`;

    const gridValues = [min, (min + max) / 2, max];
    return {
      line,
      area,
      x,
      y,
      padL,
      padT,
      h,
      w,
      grid: gridValues.map((v) => ({ v, y: y(v) })),
      last: points[points.length - 1],
    };
  }, [points, width, height]);

  if (points.length < 2) {
    return (
      <View style={[styles.placeholder, { height }]} onLayout={onLayout}>
        <Text style={styles.placeholderText}>
          {points.length === 0
            ? 'Aucune donnée pour cet exercice.'
            : 'Une seule séance enregistrée — la courbe apparaît à partir de la deuxième.'}
        </Text>
      </View>
    );
  }

  return (
    <View onLayout={onLayout} style={{ height }}>
      {geom ? (
        <Svg width={width} height={height}>
          {geom.grid.map((g, i) => (
            <Line
              key={i}
              x1={geom.padL}
              x2={geom.padL + geom.w}
              y1={g.y}
              y2={g.y}
              stroke={c.border}
              strokeWidth={1}
            />
          ))}
          {geom.grid.map((g, i) => (
            <SvgText key={`t${i}`} x={0} y={g.y + 4} fill={c.textFaint} fontSize={10}>
              {Math.round(g.v)}
            </SvgText>
          ))}

          <Path d={geom.area} fill={c.accent} fillOpacity={0.12} />
          <Path d={geom.line} fill="none" stroke={c.accent} strokeWidth={2.5} strokeLinejoin="round" />

          {points.map((p, i) => (
            <Circle
              key={i}
              cx={geom.x(i)}
              cy={geom.y(p.value)}
              r={i === points.length - 1 ? 4.5 : 2.5}
              fill={i === points.length - 1 ? c.accent : c.bg}
              stroke={c.accent}
              strokeWidth={2}
            />
          ))}

          <SvgText x={geom.padL} y={height - 6} fill={c.textFaint} fontSize={10}>
            {shortDate(points[0].date)}
          </SvgText>
          <SvgText
            x={geom.padL + geom.w}
            y={height - 6}
            fill={c.textFaint}
            fontSize={10}
            textAnchor="end"
          >
            {shortDate(geom.last.date)}
          </SvgText>
        </Svg>
      ) : null}
      <Text style={[styles.unit, font.tabular]}>{unit}</Text>
    </View>
  );
}

/** Petit histogramme horizontal — volume par muscle. */
export function VolumeBar({
  label,
  sets,
  max,
  tone,
}: {
  label: string;
  sets: number;
  max: number;
  tone: string;
}) {
  const pct = max > 0 ? Math.min(1, sets / max) : 0;
  return (
    <View style={styles.barRow}>
      <Text style={styles.barLabel} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pct * 100}%`, backgroundColor: tone }]} />
      </View>
      <Text style={[styles.barValue, font.tabular]}>{formatSets(sets)}</Text>
    </View>
  );
}

const formatSets = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','));

const styles = StyleSheet.create({
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.surfaceAlt,
    borderRadius: radius.md,
    padding: space.lg,
  },
  placeholderText: { color: c.textFaint, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  unit: { position: 'absolute', top: 0, right: 0, color: c.textFaint, fontSize: 10 },

  barRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, height: 26 },
  barLabel: { color: c.textDim, fontSize: 12, width: 118 },
  barTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: c.surfaceAlt,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 4 },
  barValue: { color: c.text, fontSize: 12, fontWeight: '700', width: 34, textAlign: 'right' },
});
