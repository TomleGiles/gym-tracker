import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Platform, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CardioList } from '../../../components/Cardio';
import { RecordCard, WeekCard } from '../../../components/Progress';
import { Text } from '../../../components/Text';
import { Badge, Button, Card, GradientFill, Icon, Loading, SectionTitle, Stat } from '../../../components/ui';
import { useQuery } from '../../../db/client';
import { getSessionCardio } from '../../../db/queries/cardio';
import { getSessionRecap } from '../../../db/queries/engagement';
import { cardioDistance, cardioDuration } from '../../../lib/cardio';
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
  const { width } = useWindowDimensions();
  const wide = width >= 768;
  const recap = useQuery(() => getSessionRecap(id), [id]);
  const cardio = useQuery(() => getSessionCardio(id), [id]);
  const cardioRecords = cardio.reduce((n, e) => n + e.records.length, 0);
  const cardioMeters = cardio.reduce((m, e) => m + (e.distanceM ?? 0), 0);

  const hasRecords = (recap?.records.length ?? 0) > 0 || cardioRecords > 0;
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
  const recordTotal = records.length + cardioRecords;
  const headline = hasRecords
    ? recordTotal > 1
      ? `${recordTotal} records battus`
      : 'Nouveau record'
    : deltaPct !== null
      ? 'Plus fort que la dernière fois'
      : 'Séance terminée';

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, wide && styles.heroWide]}>
          <View style={[styles.heroCopy, wide && styles.heroCopyWide]}>
            <Text style={styles.brand}>TRAKR / BILAN DE SÉANCE</Text>
            <Text style={[styles.headline, wide && styles.headlineWide]}>DU TRAVAIL.{ '\n' }DU PROGRÈS.</Text>
            <Text style={styles.headlineSub}>{headline}.</Text>
            <Text style={styles.kicker}>{summary.routineName} · {sessionNumber}{sessionNumber === 1 ? 're' : 'e'} séance</Text>
          </View>
          <View style={styles.medal}>
            <GradientFill
              colors={hasRecords ? [c.pr, '#E2A83B'] : c.accentGradient}
              borderRadius={36}
            />
            <Icon name={hasRecords ? 'trophy-outline' : 'checkmark'} size={60} color={c.bg} />
          </View>
        </View>

        <Card>
          <View style={styles.statRow}>
            <Stat
              size="lg"
              value={summary.durationMin !== null ? duration(summary.durationMin) : '—'}
              label="Durée"
            />
            {/* Une séance 100 % cardio n'a pas à afficher « 0 série · 0 kg ». */}
            {summary.setCount > 0 ? (
              <>
                <Stat size="lg" value={String(summary.setCount)} label="Séries" />
                <Stat size="lg" value={tonnageLabel(summary.tonnage)} label="Tonnage" />
              </>
            ) : cardioMeters > 0 ? (
              <Stat size="lg" value={cardioDistance(cardioMeters)} label="Distance" />
            ) : null}
            {summary.cardioSec > 0 ? <Stat size="lg" value={cardioDuration(summary.cardioSec)} label="Cardio" tone="accent" /> : null}
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

        {records.length ? (
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

        {cardio.length ? (
          <>
            <SectionTitle
              right={cardioRecords ? <Badge label={plural(cardioRecords, 'record')} tone="pr" icon="trophy" /> : undefined}
            >
              Cardio
            </SectionTitle>
            <CardioList entries={cardio} />
          </>
        ) : null}

        <SectionTitle>La régularité fait la différence</SectionTitle>
        <WeekCard week={week} streakWeeks={streakWeeks} />
      </ScrollView>

      <View style={styles.footer}>
        <Button label="Retour au tableau de bord" size="lg" icon="arrow-forward" onPress={() => router.replace('/')} />
        <Button
          label="Voir le détail de la séance"
          variant="ghost"
          onPress={() => router.replace(`/history/${id}`)}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  content: { width: '100%', maxWidth: 900, alignSelf: 'center', padding: space.xl, gap: space.lg, paddingBottom: space.xl },

  hero: { alignItems: 'center', paddingTop: space.xl, paddingBottom: space.lg, gap: space.xl },
  heroWide: { flexDirection: 'row', justifyContent: 'space-between', gap: space.xxl, paddingVertical: 40 },
  heroCopy: { alignItems: 'center', gap: space.md },
  heroCopyWide: { flex: 1, alignItems: 'flex-start' },
  brand: { ...type.overline, color: c.accent, letterSpacing: 2, fontSize: 10 },
  medal: {
    width: 132,
    height: 132,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    transform: [{ rotate: '-8deg' }],
  },
  kicker: { color: c.textDim, fontSize: 12 },
  headline: { ...type.hero, fontSize: 52, lineHeight: 50, textAlign: 'center', marginTop: space.sm },
  headlineWide: { fontSize: 80, lineHeight: 74, textAlign: 'left' },
  headlineSub: { color: c.text, fontSize: 17, fontWeight: '600', textAlign: 'center' },

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
    width: '100%',
    maxWidth: 900,
    alignSelf: 'center',
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.sm,
    gap: space.xs,
    borderTopWidth: 1,
    borderTopColor: c.border,
    backgroundColor: c.bg,
  },
});
