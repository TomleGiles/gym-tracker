import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from './Text';
import { Badge, Card, Icon, ProgressRing } from './ui';
import type { RecordHighlight, WeekActivity } from '../db/queries/engagement';
import { plural, relativeDay } from '../lib/format';
import { fmtE1rm, fmtKg } from '../lib/strength';
import { c, font, radius, space, type } from '../lib/theme';

/*
 * Briques de rétention partagées par l'accueil et le bilan de séance :
 * l'objectif de la semaine et les cartes de record.
 */

const DAY_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

export function WeekCard({ week, streakWeeks }: { week: WeekActivity; streakWeeks: number }) {
  const reached = week.done >= week.goal;
  const left = week.goal - week.done;
  const message = reached
    ? week.done > week.goal
      ? `Objectif dépassé : ${week.done} séances cette semaine.`
      : 'Objectif atteint. Bien joué.'
    : week.done === 0
      ? `${plural(week.goal, 'séance')} au programme cette semaine.`
      : `Plus que ${plural(left, 'séance')} pour ton objectif.`;

  return (
    <Card>
      <View style={styles.weekTop}>
        <ProgressRing progress={week.done / week.goal} size={76} stroke={8} color={reached ? c.ok : c.accent}>
          <Text style={styles.ringValue}>
            {week.done}
            <Text style={styles.ringGoal}>/{week.goal}</Text>
          </Text>
        </ProgressRing>
        <View style={styles.flex}>
          <Text style={type.h3}>Objectif de la semaine</Text>
          <Text style={[type.small, { marginTop: 2 }]}>{message}</Text>
          {streakWeeks > 1 ? (
            <View style={{ marginTop: space.sm, alignSelf: 'flex-start' }}>
              <Badge label={`${streakWeeks} semaines d'affilée`} tone="ok" icon="flame" />
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.days}>
        {DAY_LETTERS.map((letter, i) => {
          const done = week.days[i];
          const isToday = i === week.todayIndex;
          return (
            <View key={i} style={styles.day}>
              <View
                style={[
                  styles.dayDot,
                  done && styles.dayDotDone,
                  isToday && !done && styles.dayDotToday,
                  i > week.todayIndex && styles.dayDotFuture,
                ]}
              >
                {done ? <Icon name="checkmark" size={14} color={c.bg} /> : null}
              </View>
              <Text style={[styles.dayLetter, isToday && { color: c.text }]}>{letter}</Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

export function RecordCard({ record, onPress }: { record: RecordHighlight; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.record, pressed && { opacity: 0.7 }]}>
      <View style={styles.recordIcon}>
        <Icon name="trophy" size={16} color={c.pr} />
      </View>
      <Text style={styles.recordLabel} numberOfLines={2}>
        {record.label}
      </Text>
      <Text style={styles.recordValue}>
        {fmtKg(record.weightKg)} kg × {record.reps}
      </Text>
      <Text style={styles.recordGain} numberOfLines={1}>
        1RM {fmtE1rm(record.e1rm)}
        {record.gain !== null && record.gain > 0.05 ? ` (+${fmtKg(Math.round(record.gain * 10) / 10)})` : ''}
      </Text>
      <Text style={styles.recordWhen}>{relativeDay(record.loggedAt)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  weekTop: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  ringValue: { ...font.display, color: c.text, fontSize: 26 },
  ringGoal: { ...font.display, color: c.textFaint, fontSize: 18 },
  days: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.lg },
  day: { alignItems: 'center', gap: 6 },
  dayDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: c.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayDotDone: { backgroundColor: c.ok },
  dayDotToday: { backgroundColor: 'transparent', borderWidth: 2, borderColor: c.accent },
  dayDotFuture: { backgroundColor: c.surfaceAlt },
  dayLetter: { color: c.textFaint, fontSize: 12, fontWeight: '600' },
  record: {
    width: 156,
    backgroundColor: c.surface,
    borderRadius: radius.lg,
    padding: space.md,
    gap: 2,
  },
  recordIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: c.prDim,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  recordLabel: { color: c.textDim, fontSize: 13, fontWeight: '500', minHeight: 36 },
  recordValue: { ...font.display, color: c.text, fontSize: 24, marginTop: space.xs },
  recordGain: { color: c.pr, fontSize: 12, fontWeight: '600' },
  recordWhen: { ...type.caption, marginTop: space.xs },
});
