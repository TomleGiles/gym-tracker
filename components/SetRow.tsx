import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { SetLog, SetType } from '../db/schema';
import { fmtKg } from '../lib/strength';
import { c, font, radius, space } from '../lib/theme';
import { Icon } from './ui';

export type SetRowProps = {
  index: number;
  /** La série correspondante de la dernière fois, si elle existe. */
  previous: SetLog | null;
  weight: string;
  reps: string;
  /** Renseigné quand la série est déjà enregistrée. */
  logged: SetLog | null;
  setType: SetType;
  onPressWeight: () => void;
  onPressReps: () => void;
  onValidate: () => void;
  onLongPress: () => void;
};

/**
 * La ligne de série — le composant le plus critique de l'app.
 *
 * Contraintes : utilisée debout, une main, mains moites, entre deux séries.
 * Donc : cibles ≥ 44 pt, chiffres tabulaires pour que les colonnes ne dansent
 * pas, et un seul geste dans le cas nominal (appuyer sur ✓, rien à saisir).
 */
export const SetRow = memo(function SetRow({
  index,
  previous,
  weight,
  reps,
  logged,
  setType,
  onPressWeight,
  onPressReps,
  onValidate,
  onLongPress,
}: SetRowProps) {
  const done = logged !== null;
  const isWarmup = setType === 'warmup';

  return (
    <View style={[styles.row, done && styles.rowDone]}>
      <Pressable onLongPress={onLongPress} hitSlop={6} style={styles.indexCell}>
        <Text style={[styles.index, font.tabular, isWarmup && { color: c.warn }]}>
          {isWarmup ? 'É' : index}
        </Text>
      </Pressable>

      <Text style={[styles.previous, font.tabular]} numberOfLines={1}>
        {previous ? `${fmtKg(previous.weightKg)} × ${previous.reps}` : '—'}
      </Text>

      <Cell value={weight} unit="kg" done={done} onPress={onPressWeight} />
      <Cell value={reps} unit="reps" done={done} onPress={onPressReps} />

      <Pressable
        onPress={onValidate}
        onLongPress={onLongPress}
        accessibilityRole="button"
        accessibilityLabel={done ? `Série ${index} enregistrée` : `Valider la série ${index}`}
        style={({ pressed }) => [styles.check, done && styles.checkDone, pressed && { opacity: 0.6 }]}
      >
        {done ? (
          <Icon name="checkmark" size={20} color={c.bg} />
        ) : (
          <View style={styles.checkEmpty} />
        )}
      </Pressable>

      {logged?.isPr ? (
        <View style={styles.prTag}>
          <Text style={styles.prTagLabel}>PR</Text>
        </View>
      ) : null}
    </View>
  );
});

function Cell({
  value,
  unit,
  done,
  onPress,
}: {
  value: string;
  unit: string;
  done: boolean;
  onPress: () => void;
}) {
  const empty = !value;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${unit} : ${value || 'vide'}`}
      style={({ pressed }) => [styles.cell, done && styles.cellDone, pressed && styles.cellPressed]}
    >
      <Text
        style={[styles.cellValue, font.tabular, empty && { color: c.textFaint }, done && { color: c.text }]}
        numberOfLines={1}
      >
        {value || '—'}
      </Text>
    </Pressable>
  );
}

export const setRowStyles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.xs },
  headerIndex: { width: 26, textAlign: 'center', color: c.textFaint, fontSize: 10, fontWeight: '700' },
  headerPrevious: { width: 74, color: c.textFaint, fontSize: 10, fontWeight: '700' },
  headerCell: { flex: 1, textAlign: 'center', color: c.textFaint, fontSize: 10, fontWeight: '700' },
  headerCheck: { width: 44 },
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: 5,
    paddingHorizontal: space.xs,
    borderRadius: radius.md,
  },
  rowDone: { backgroundColor: 'rgba(52,211,153,0.06)' },

  indexCell: { width: 26, alignItems: 'center', justifyContent: 'center', height: 44 },
  index: { color: c.textFaint, fontSize: 13, fontWeight: '800' },

  previous: { width: 74, color: c.textFaint, fontSize: 13 },

  cell: {
    flex: 1,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: c.surfaceAlt,
    borderWidth: 1,
    borderColor: c.border,
  },
  cellDone: { backgroundColor: 'transparent', borderColor: 'transparent' },
  cellPressed: { borderColor: c.accent },
  cellValue: { color: c.text, fontSize: 17, fontWeight: '700' },

  check: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: c.surfaceAlt,
    borderWidth: 1,
    borderColor: c.border,
  },
  checkDone: { backgroundColor: c.ok, borderColor: c.ok },
  checkEmpty: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: c.borderStrong },

  prTag: {
    position: 'absolute',
    right: 46,
    top: 0,
    backgroundColor: c.accent,
    borderRadius: 4,
    paddingHorizontal: 4,
  },
  prTagLabel: { color: c.bg, fontSize: 9, fontWeight: '900' },
});
