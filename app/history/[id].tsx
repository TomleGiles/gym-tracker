import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '../../components/Text';
import { BodyMap, highlightsFromIntensities } from '../../components/BodyMap/BodyMap';
import { Badge, Card, EmptyState, Icon, Screen, SectionTitle, Stat } from '../../components/ui';
import { useQuery } from '../../db/client';
import { musclesOf } from '../../db/queries/exercises';
import { getSessionDetail } from '../../db/queries/stats';
import type { Muscle } from '../../db/schema';
import { SET_TYPE_LABEL, clockTime, duration, longDate, plural, tonnageLabel } from '../../lib/format';
import { e1rm, fmtE1rm, fmtKg, tonnage } from '../../lib/strength';
import { c, font, radius, space } from '../../lib/theme';
import { ROLE_WEIGHT } from '../../lib/volume';

export default function SessionHistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const detail = useQuery(() => getSessionDetail(id), [id]);

  const highlights = useQuery(() => {
    const d = getSessionDetail(id);
    if (!d) return {};
    const byExercise = musclesOf(d.exercises.map((e) => e.exerciseId));
    const load = new Map<string, { muscle: Muscle; sets: number }>();
    for (const ex of d.exercises) {
      const working = ex.sets.filter((s) => s.setType !== 'warmup').length;
      for (const { muscle, role } of byExercise.get(ex.exerciseId) ?? []) {
        const w = ROLE_WEIGHT[role];
        if (!w) continue;
        const entry = load.get(muscle.id) ?? { muscle, sets: 0 };
        entry.sets += working * w;
        load.set(muscle.id, entry);
      }
    }
    const peak = Math.max(...[...load.values()].map((e) => e.sets), 1);
    return highlightsFromIntensities(
      [...load.values()].map((e) => ({ muscle: e.muscle, intensity: e.sets / peak })),
    );
  }, [id]);

  if (!detail) {
    return (
      <Screen>
        <EmptyState icon="alert-circle" title="Séance introuvable" body="Elle a peut-être été supprimée." />
      </Screen>
    );
  }

  const { summary, exercises } = detail;

  return (
    <>
      <Screen scroll edges={[]}>
        <View style={styles.head}>
          <Text style={styles.title}>{summary.routineName}</Text>
          <Text style={styles.date}>
            {longDate(summary.startedAt)} · {clockTime(summary.startedAt)}
            {summary.endedAt ? ` → ${clockTime(summary.endedAt)}` : ' · en cours'}
          </Text>
        </View>

        <Card>
          <View style={styles.statRow}>
            <Stat value={String(summary.setCount)} label="Séries" />
            <Stat value={tonnageLabel(summary.tonnage)} label="Tonnage" />
            <Stat
              value={summary.durationMin !== null ? duration(summary.durationMin) : '—'}
              label="Durée"
            />
            <Stat
              value={String(summary.prCount)}
              label="Records"
              tone={summary.prCount ? 'pr' : 'default'}
            />
          </View>
          <View style={styles.bodyWrap}>
            <BodyMap highlights={highlights} view="both" size={116} />
          </View>
        </Card>

        <SectionTitle>{plural(exercises.length, 'exercice')}</SectionTitle>

        {exercises.map((ex) => {
          const working = ex.sets.filter((s) => s.setType !== 'warmup');
          const best = working.reduce(
            (acc, s) => (e1rm(s.weightKg, s.reps) > acc ? e1rm(s.weightKg, s.reps) : acc),
            0,
          );
          return (
            <Card key={ex.exerciseId} style={styles.exercise}>
              <Pressable
                onPress={() => router.push(`/exercises/${ex.exerciseId}`)}
                style={styles.exerciseHead}
              >
                <Text style={styles.exerciseTitle} numberOfLines={2}>
                  {ex.label}
                </Text>
                <Icon name="chevron-forward" size={16} color={c.textFaint} />
              </Pressable>

              {ex.sets.map((s, i) => (
                <View key={s.id} style={styles.setLine}>
                  <Text style={[styles.setIndex, font.tabular]}>
                    {s.setType === 'warmup' ? 'É' : i + 1}
                  </Text>
                  <Text style={[styles.setValue, font.tabular]}>
                    {fmtKg(s.weightKg)} kg × {s.reps}
                  </Text>
                  {s.setType !== 'working' ? <Badge label={SET_TYPE_LABEL[s.setType]} /> : null}
                  {s.isPr ? <Badge label="PR" tone="pr" /> : null}
                  <Text style={[styles.setE1rm, font.tabular]}>
                    {s.setType === 'warmup' ? '' : fmtE1rm(e1rm(s.weightKg, s.reps))}
                  </Text>
                </View>
              ))}

              <Text style={styles.exerciseFoot}>
                {plural(working.length, 'série')} · {tonnageLabel(tonnage(ex.sets))}
                {best > 0 ? ` · meilleur ${fmtE1rm(best)} est.` : ''}
              </Text>
            </Card>
          );
        })}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  head: { gap: space.xs },
  title: { ...font.display, color: c.text, fontSize: 40, lineHeight: 44 },
  date: { color: c.textDim, fontSize: 14, textTransform: 'capitalize' },

  statRow: { flexDirection: 'row', gap: space.md },
  bodyWrap: { alignItems: 'center', marginTop: space.lg },

  exercise: { padding: space.md, gap: space.xs },
  exerciseHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.xs },
  exerciseTitle: { flex: 1, color: c.text, fontSize: 15, fontWeight: '700' },
  setLine: { flexDirection: 'row', alignItems: 'center', gap: space.sm, height: 26 },
  setIndex: { color: c.textFaint, fontSize: 12, width: 16 },
  setValue: { color: c.text, fontSize: 14, fontWeight: '600', minWidth: 96 },
  setE1rm: { flex: 1, color: c.textFaint, fontSize: 12, textAlign: 'right' },
  exerciseFoot: {
    color: c.textFaint,
    fontSize: 12,
    marginTop: space.xs,
    borderTopWidth: 1,
    borderTopColor: c.border,
    paddingTop: space.sm,
  },
  radiusRef: { borderRadius: radius.sm },
});
