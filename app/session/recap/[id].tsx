import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RecordCard, WeekCard } from '../../../components/Progress';
import { Text } from '../../../components/Text';
import { Badge, Button, Card, GradientFill, Icon, Loading, SectionTitle, Stat } from '../../../components/ui';
import { useQuery } from '../../../db/client';
import { getSessionRecap } from '../../../db/queries/engagement';
import { duration, plural, tonnageLabel } from '../../../lib/format';
import { c, font, space, type } from '../../../lib/theme';

/**
 * Bilan de fin de séance. C'est le moment où l'effort est encore frais : on
 * montre ce qui a progressé (records, tonnage vs la dernière fois) et où en est
 * la semaine, plutôt que de retomber sur un tableau de séries.
 */
export default function SessionRecapScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const recap = useQuery(() => getSessionRecap(id), [id]);

  const hasRecords = (recap?.records.length ?? 0) > 0;
  useEffect(() => {
    if (Platform.OS === 'web' || !recap) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Une seule fois à l'ouverture, pas à chaque relecture de la base.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!recap]);

  if (!recap) {
    return (
      <SafeAreaView style={styles.screen}>
        <Loading />
      </SafeAreaView>
    );
  }

  const { summary, records, tonnageDelta, week, streakWeeks, sessionNumber } = recap;
  // Seulement quand c'est une bonne nouvelle : une séance écourtée n'a pas à
  // finir sur « −60 % ». Les records et la semaine suffisent à la valoriser.
  const deltaPct = tonnageDelta && tonnageDelta.ratio > 0 ? Math.round(tonnageDelta.ratio * 100) : null;
  const headline = hasRecords
    ? records.length > 1
      ? `${records.length} records battus`
      : 'Nouveau record'
    : deltaPct !== null
      ? 'Plus fort que la dernière fois'
      : 'Séance terminée';

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.medal}>
            <GradientFill
              colors={hasRecords ? ['#FFD66B', '#FF9F2E'] : c.accentGradient}
              borderRadius={48}
            />
            <Icon name={hasRecords ? 'trophy' : 'checkmark'} size={44} color="#FFFFFF" />
          </View>
          <Text style={styles.kicker}>
            {sessionNumber}
            {sessionNumber === 1 ? 're' : 'e'} séance · {summary.routineName}
          </Text>
          <Text style={styles.headline}>{headline}</Text>
        </View>

        <Card>
          <View style={styles.statRow}>
            <Stat
              size="lg"
              value={summary.durationMin !== null ? duration(summary.durationMin) : '—'}
              label="Durée"
            />
            <Stat size="lg" value={String(summary.setCount)} label="Séries" />
            <Stat size="lg" value={tonnageLabel(summary.tonnage)} label="Tonnage" />
          </View>
          {deltaPct !== null ? (
            <View style={styles.deltaRow}>
              <Icon name="trending-up" size={16} color={c.ok} />
              <Text style={styles.deltaText}>
                +{deltaPct} % de tonnage par rapport à ta dernière {summary.routineName}
              </Text>
            </View>
          ) : null}
        </Card>

        {hasRecords ? (
          <>
            <SectionTitle right={<Badge label={plural(records.length, 'record')} tone="pr" icon="trophy" />}>
              Records
            </SectionTitle>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.recordsScroller}
              contentContainerStyle={styles.recordsRow}
            >
              {records.map((r) => (
                <RecordCard key={r.exerciseId} record={r} onPress={() => router.push(`/exercises/${r.exerciseId}`)} />
              ))}
            </ScrollView>
          </>
        ) : null}

        <SectionTitle>Ta semaine</SectionTitle>
        <WeekCard week={week} streakWeeks={streakWeeks} />
      </ScrollView>

      <View style={styles.footer}>
        <Button label="Terminer" size="lg" icon="checkmark" onPress={() => router.replace('/')} />
        <Button
          label="Voir le détail des séries"
          variant="ghost"
          onPress={() => router.replace(`/history/${id}`)}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  content: { padding: space.lg, gap: space.md, paddingBottom: space.xl },

  hero: { alignItems: 'center', paddingTop: space.xl, paddingBottom: space.lg },
  medal: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: space.lg,
  },
  kicker: { ...type.overline, color: c.textDim },
  headline: { ...type.hero, fontSize: 40, lineHeight: 44, textAlign: 'center', marginTop: space.sm },

  statRow: { flexDirection: 'row', gap: space.md },
  deltaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.lg,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: c.border,
  },
  deltaText: { ...type.small, color: c.ok, flex: 1, ...font.tabular },

  recordsScroller: { marginHorizontal: -space.lg },
  recordsRow: { paddingHorizontal: space.lg, gap: space.sm },

  footer: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.sm,
    gap: space.xs,
    borderTopWidth: 1,
    borderTopColor: c.border,
    backgroundColor: c.bg,
  },
});
