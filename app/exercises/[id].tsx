import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Text } from '../../components/Text';
import { BodyMap, highlightsFromRoles } from '../../components/BodyMap/BodyMap';
import { ProgressChart } from '../../components/ProgressChart';
import { Badge, Card, Chip, EmptyState, Icon, Screen, SectionTitle, Stat } from '../../components/ui';
import { useQuery } from '../../db/client';
import { getExercise } from '../../db/queries/exercises';
import { getExerciseProgress } from '../../db/queries/stats';
import { EQUIPMENT_LABEL, plural, relativeDay, shortDate } from '../../lib/format';
import { e1rm, fmtE1rm, fmtKg } from '../../lib/strength';
import type { Trend } from '../../lib/strength';
import { c, font, radius, space } from '../../lib/theme';

const TREND_UI: Record<Trend, { icon: 'trending-up' | 'remove' | 'trending-down'; color: string; label: string }> = {
  up: { icon: 'trending-up', color: c.ok, label: 'En progression' },
  flat: { icon: 'remove', color: c.textDim, label: 'Stable' },
  down: { icon: 'trending-down', color: c.warn, label: 'En baisse' },
};

export default function ExerciseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const exercise = useQuery(() => getExercise(id), [id]);
  const progress = useQuery(() => getExerciseProgress(id), [id]);

  if (!exercise) {
    return (
      <Screen>
        <EmptyState icon="alert-circle" title="Exercice introuvable" body="Il a peut-être été supprimé." />
      </Screen>
    );
  }

  const highlights = highlightsFromRoles(exercise.muscles);
  const primary = exercise.muscles.filter((m) => m.role === 'primary');
  const secondary = exercise.muscles.filter((m) => m.role === 'secondary');
  const stabilizers = exercise.muscles.filter((m) => m.role === 'stabilizer');
  const trendUi = TREND_UI[progress.trend];

  return (
    <>
      <Screen scroll edges={[]}>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>{exercise.labelFr}</Text>
          <View style={styles.tagRow}>
            <Badge label={EQUIPMENT_LABEL[exercise.equipment]} />
            <Badge label={exercise.mechanic === 'compound' ? 'Polyarticulaire' : 'Isolation'} />
            {exercise.isUnilateral ? <Badge label="Unilatéral" /> : null}
            {exercise.isCustom ? <Badge label="Perso" /> : null}
          </View>
        </View>

        <Card>
          <View style={styles.bodyWrap}>
            <BodyMap highlights={highlights} view="both" size={132} showStabilizers />
          </View>
          <View style={styles.legend}>
            <LegendDot color={c.bodyPrimary} label="Principal" />
            <LegendDot color={c.bodySecondary} label="Secondaire" />
            <LegendDot color={c.bodyStabilizer} label="Stabilisateur" />
          </View>
          <View style={styles.muscleLists}>
            <MuscleLine label="Principaux" items={primary.map((m) => m.muscle.labelFr)} strong />
            <MuscleLine label="Secondaires" items={secondary.map((m) => m.muscle.labelFr)} />
            <MuscleLine label="Stabilisateurs" items={stabilizers.map((m) => m.muscle.labelFr)} />
          </View>
        </Card>

        {exercise.cues ? (
          <Card>
            <SectionTitle>Exécution</SectionTitle>
            <Text style={styles.cues}>{exercise.cues}</Text>
            {exercise.barWeightKg ? (
              <Text style={styles.barNote}>
                Barre à vide : {fmtKg(exercise.barWeightKg)} kg. Le champ « poids » reste ce que tu
                as réellement sur la barre, chargement compris.
              </Text>
            ) : null}
          </Card>
        ) : null}

        <SectionTitle right={
          <View style={styles.trend}>
            <Icon name={trendUi.icon} size={15} color={trendUi.color} />
            <Text style={[styles.trendLabel, { color: trendUi.color }]}>{trendUi.label}</Text>
          </View>
        }>
          Progression
        </SectionTitle>

        {progress.totalSets === 0 ? (
          <Card>
            <EmptyState
              icon="analytics"
              title="Pas encore de données"
              body="Enregistre cet exercice dans une séance et la courbe se construira toute seule."
            />
          </Card>
        ) : (
          <>
            <Card>
              <Text style={styles.chartTitle}>1RM estimé par séance</Text>
              <ProgressChart
                points={progress.points.map((p) => ({ date: p.date, value: p.bestE1rm }))}
              />
            </Card>

            <Card>
              <View style={styles.statRow}>
                <Stat value={`${fmtKg(progress.prWeightKg)} kg`} label="Charge max" tone="pr" />
                <Stat value={fmtE1rm(progress.bestE1rm)} label="1RM estimé" />
                <Stat value={`${Math.round(progress.prSetVolume)} kg`} label="Volume max" />
              </View>
              {progress.bestSet ? (
                <Text style={styles.bestSet}>
                  Meilleure série : {fmtKg(progress.bestSet.weightKg)} kg × {progress.bestSet.reps}{' '}
                  ({fmtE1rm(e1rm(progress.bestSet.weightKg, progress.bestSet.reps))} estimés)
                </Text>
              ) : null}
              <Text style={styles.footNote}>
                {plural(progress.totalSets, 'série')} de travail
                {progress.lastPerformedAt ? ` · dernière fois ${relativeDay(progress.lastPerformedAt)}` : ''}
              </Text>
            </Card>

            <SectionTitle>Dernières séances</SectionTitle>
            <Card style={{ gap: space.sm }}>
              {progress.points
                .slice(-8)
                .reverse()
                .map((p) => (
                  <View key={p.sessionId} style={styles.histRow}>
                    <Text style={styles.histDate}>{shortDate(p.date)}</Text>
                    <Text style={styles.histMain}>
                      {fmtKg(p.topWeight)} kg · {plural(p.sets, 'série')}
                    </Text>
                    <Chip label={fmtE1rm(p.bestE1rm)} />
                  </View>
                ))}
            </Card>
          </>
        )}
      </Screen>
    </>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

function MuscleLine({ label, items, strong }: { label: string; items: string[]; strong?: boolean }) {
  if (!items.length) return null;
  return (
    <View style={styles.muscleLine}>
      <Text style={styles.muscleLabel}>{label}</Text>
      <Text style={[styles.muscleValue, strong && { color: c.text, fontWeight: '600' }]}>
        {items.join(', ')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  titleBlock: { gap: space.sm },
  title: { ...font.display, color: c.text, fontSize: 36, lineHeight: 40 },
  tagRow: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },

  bodyWrap: { alignItems: 'center' },
  legend: { flexDirection: 'row', justifyContent: 'center', gap: space.lg, marginTop: space.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendLabel: { color: c.textDim, fontSize: 11 },

  muscleLists: {
    marginTop: space.lg,
    gap: space.sm,
    borderTopWidth: 1,
    borderTopColor: c.border,
    paddingTop: space.md,
  },
  muscleLine: { flexDirection: 'row', gap: space.md },
  muscleLabel: { color: c.textFaint, fontSize: 12, width: 104 },
  muscleValue: { color: c.textDim, fontSize: 13, flex: 1, lineHeight: 18 },

  cues: { color: c.text, fontSize: 15, lineHeight: 22, marginTop: space.sm },
  barNote: {
    color: c.textFaint,
    fontSize: 12,
    lineHeight: 17,
    marginTop: space.md,
    borderLeftWidth: 2,
    borderLeftColor: c.border,
    paddingLeft: space.md,
  },

  trend: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  trendLabel: { fontSize: 12, fontWeight: '700' },

  chartTitle: { color: c.textDim, fontSize: 13, fontWeight: '600', marginBottom: space.sm },
  statRow: { flexDirection: 'row', gap: space.md },
  bestSet: { color: c.text, fontSize: 14, marginTop: space.lg, fontWeight: '600' },
  footNote: { color: c.textFaint, fontSize: 12, marginTop: space.xs },

  histRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  histDate: { color: c.textFaint, fontSize: 12, width: 58 },
  histMain: { color: c.text, fontSize: 14, flex: 1 },
  radiusPlaceholder: { borderRadius: radius.sm },
});
