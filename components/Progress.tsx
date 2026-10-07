import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from './Text';
import { Badge, Card, Icon, ProgressRing } from './ui';
import type { RecordHighlight, WeekActivity } from '../db/queries/engagement';
import { plural, relativeDay } from '../lib/format';
import { fmtE1rm, fmtKg } from '../lib/strength';
import { c, font, radius, space, type } from '../lib/theme';

const DAY_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

export function WeekCard({ week, streakWeeks }: { week: WeekActivity; streakWeeks: number }) {
  const reached = week.done >= week.goal;
  const left = week.goal - week.done;
  const message = reached
    ? week.done > week.goal ? 'Tu vas au-delà de ton objectif.' : 'Objectif atteint. Garde cet élan.'
    : week.done === 0 ? `${plural(week.goal, 'séance')} pour faire la différence.` : `Encore ${plural(left, 'séance')} pour y arriver.`;

  return (
    <Card style={styles.weekCard}>
      <View style={styles.weekHeading}>
        <Text style={styles.eyebrow}>TA SEMAINE</Text>
        {streakWeeks > 1 ? <Badge label={`${streakWeeks} sem. d'affilée`} tone="ok" icon="flame" /> : <Icon name="calendar-outline" size={17} color={c.textFaint} />}
      </View>
      <View style={styles.weekTop}>
        <View accessibilityLabel={`${week.done} séances sur un objectif de ${week.goal}`}>
          <ProgressRing progress={week.done / week.goal} size={82} stroke={6} color={reached ? c.ok : c.accent}>
            <Text style={styles.ringValue}>{week.done}<Text style={styles.ringGoal}>/{week.goal}</Text></Text>
          </ProgressRing>
        </View>
        <View style={styles.flex}>
          <Text style={styles.weekTitle}>{reached ? 'Le rythme est là.' : 'Construis ta régularité.'}</Text>
          <Text style={styles.weekMessage}>{message}</Text>
        </View>
      </View>
      <View style={styles.days}>
        {DAY_LETTERS.map((letter, i) => {
          const done = week.days[i];
          const isToday = i === week.todayIndex;
          return (
            <View key={i} style={[styles.day, isToday && styles.dayToday]} accessible accessibilityLabel={`${DAY_NAMES[i]}${isToday ? ', aujourd’hui' : ''} : ${done ? 'séance terminée' : 'aucune séance'}`}>
              <Text style={[styles.dayLetter, isToday && styles.dayLetterToday]}>{letter}</Text>
              <View style={[styles.dayDot, done && styles.dayDotDone, isToday && !done && styles.dayDotToday]}>
                {done ? <Icon name="checkmark" size={14} color={c.bg} /> : <View style={[styles.dayMark, isToday && { backgroundColor: c.accent }]} />}
              </View>
              <View style={[styles.todayMark, isToday && { backgroundColor: c.accent }]} />
            </View>
          );
        })}
      </View>
    </Card>
  );
}

export function RecordCard({ record, onPress }: { record: RecordHighlight; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Record de ${record.label}, ${fmtKg(record.weightKg)} kilos, ${record.reps} répétitions. Voir l’exercice.`} style={({ pressed }) => [styles.record, pressed && { opacity: 0.75 }]}>
      <View style={styles.recordTop}><View style={styles.recordIcon}><Icon name="trophy-outline" size={17} color={c.pr} /></View><Icon name="arrow-forward-outline" size={15} color={c.textFaint} /></View>
      <Text style={styles.recordLabel} numberOfLines={2}>{record.label}</Text>
      <Text style={styles.recordValue}>{fmtKg(record.weightKg)}<Text style={styles.recordUnit}> kg</Text></Text>
      <View style={styles.recordDetails}><Text style={styles.recordReps}>{record.reps} répétitions</Text>{record.gain !== null && record.gain > 0.05 ? <Text style={styles.recordGain}>+{fmtKg(Math.round(record.gain * 10) / 10)} kg</Text> : null}</View>
      <View style={styles.recordFooter}><Text style={styles.recordWhen}>{relativeDay(record.loggedAt)}</Text><Text style={styles.recordEstimate}>1RM {fmtE1rm(record.e1rm)}</Text></View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  weekCard: { gap: 20 },
  weekHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  eyebrow: { color: c.textFaint, fontSize: 10, fontWeight: '700', letterSpacing: 1.4 },
  weekTop: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  weekTitle: { color: c.text, fontSize: 17, lineHeight: 23, fontWeight: '600', letterSpacing: -0.4 },
  weekMessage: { color: c.textDim, fontSize: 12, lineHeight: 19, marginTop: 4 },
  ringValue: { ...font.display, color: c.text, fontSize: 31 },
  ringGoal: { ...font.display, color: c.textFaint, fontSize: 20 },
  days: { flexDirection: 'row', gap: 4 },
  day: { flex: 1, minWidth: 0, alignItems: 'center', gap: 9, paddingTop: 10, paddingBottom: 7, borderRadius: 12 },
  dayToday: { backgroundColor: c.surfaceAlt },
  dayDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  dayDotDone: { backgroundColor: c.accent },
  dayDotToday: { backgroundColor: c.accentDim, borderWidth: 1, borderColor: c.accent },
  dayMark: { width: 3, height: 3, borderRadius: 2, backgroundColor: c.textFaint },
  dayLetter: { color: c.textFaint, fontSize: 11, fontWeight: '600' },
  dayLetterToday: { color: c.text },
  todayMark: { width: 3, height: 3, borderRadius: 2, backgroundColor: 'transparent' },
  record: { width: 190, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.lg, padding: space.lg, gap: 4 },
  recordTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  recordIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: c.prDim, alignItems: 'center', justifyContent: 'center' },
  recordLabel: { color: c.textDim, fontSize: 12, lineHeight: 18, fontWeight: '500', minHeight: 36 },
  recordValue: { ...font.display, color: c.text, fontSize: 39, marginTop: 5 },
  recordUnit: { ...font.display, color: c.textFaint, fontSize: 20 },
  recordDetails: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' },
  recordReps: { color: c.textFaint, fontSize: 10 },
  recordGain: { color: c.pr, fontSize: 10, fontWeight: '600' },
  recordFooter: { borderTopWidth: 1, borderTopColor: c.border, marginTop: 10, paddingTop: 12, gap: 4 },
  recordWhen: { ...type.caption, fontSize: 10 },
  recordEstimate: { color: c.textFaint, fontSize: 10 },
});
