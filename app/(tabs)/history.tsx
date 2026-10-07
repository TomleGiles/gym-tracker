import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Text } from '../../components/Text';
import { BodyMap, highlightsFromIntensities } from '../../components/BodyMap/BodyMap';
import { Badge, Button, Chip, EmptyState, Icon, PageHeader, Screen } from '../../components/ui';
import { useQuery } from '../../db/client';
import { getLifetimeStats, getMuscleVolume, listSessions } from '../../db/queries/stats';
import type { SessionSummary } from '../../db/queries/stats';
import { duration, longDate, plural, tonnageLabel } from '../../lib/format';
import { c, font, radius, space, type } from '../../lib/theme';
import { exportBackup } from '../../lib/backup';

type Period = 7 | 30 | 90 | null;

export default function HistoryScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [period, setPeriod] = useState<Period>(null);
  const [recordsOnly, setRecordsOnly] = useState(false);
  const [limit, setLimit] = useState(200);
  const sessions = useQuery(() => listSessions(limit), [limit]);
  const lifetime = useQuery(() => getLifetimeStats(), []);
  const volume = useQuery(() => getMuscleVolume(7), []);
  const filtered = useMemo(() => {
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    if (period) cutoff.setDate(cutoff.getDate() - period + 1);
    return sessions.filter((s) => (!period || Date.parse(s.startedAt) >= cutoff.getTime()) && (!recordsOnly || s.prCount > 0));
  }, [sessions, period, recordsOnly]);
  const highlights = useMemo(() => {
    const peak = Math.max(...volume.map((v) => v.sets), 1);
    return highlightsFromIntensities(volume.filter((v) => v.sets > 0).map((v) => ({ muscle: v.muscle, intensity: v.sets / peak })));
  }, [volume]);
  const weeks = useMemo(() => {
    const monday = new Date();
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
    return Array.from({ length: 8 }, (_, index) => {
      const start = new Date(monday);
      start.setDate(start.getDate() - (7 - index) * 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      return {
        label: start.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
        count: sessions.filter((s) => Date.parse(s.startedAt) >= start.getTime() && Date.parse(s.startedAt) < end.getTime()).length,
      };
    });
  }, [sessions]);
  const maxWeek = Math.max(...weeks.map((w) => w.count), 1);

  return (
    <Screen>
      <FlatList
        data={filtered}
        keyExtractor={(s) => s.id}
        contentContainerStyle={[styles.list, width >= 900 && styles.listDesktop]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.header}>
            <PageHeader
              eyebrow="LES EFFORTS RESTENT"
              title="La preuve, c'est toi."
              subtitle="Chaque séance laisse une trace. Regarde le chemin parcouru."
              action={<Button label="Exporter" icon="download-outline" variant="secondary" onPress={exportBackup} />}
            />
            <View style={styles.stats}>
              <Metric label="SÉANCES" value={String(lifetime.sessions)} note="depuis le premier jour" icon="barbell-outline" />
              <Metric label="VOLUME SOULEVÉ" value={tonnageLabel(lifetime.tonnage)} note="chaque répétition compte" icon="layers-outline" accent />
              <Metric label="RECORDS PERSONNELS" value={String(lifetime.prs)} note="tes limites repoussées" icon="trophy-outline" />
            </View>
            <View style={[styles.insights, width >= 1120 && styles.insightsWide]}>
              <View style={[styles.activityCard, width >= 1120 && { flex: 1.35 }]}>
                <View style={styles.sectionHeading}>
                  <View style={styles.flex}>
                    <Text style={type.h3}>La régularité fait la différence.</Text>
                    <Text style={[type.caption, { marginTop: 6 }]}>Tes séances sur les 8 dernières semaines</Text>
                  </View>
                  <Icon name="pulse-outline" size={23} color={c.accent} />
                </View>
                <View style={styles.chart}>
                  {weeks.map((week, index) => (
                    <View key={index} style={styles.barColumn} accessible accessibilityLabel={`Semaine du ${week.label} : ${plural(week.count, 'séance')}`}>
                      <Text style={[styles.barValue, index === 7 && { color: c.accent }]}>{week.count}</Text>
                      <View style={styles.barTrack}>
                        <View style={[styles.bar, { height: week.count ? `${Math.max(8, week.count / maxWeek * 100)}%` : 3, backgroundColor: index === 7 ? c.accent : week.count ? c.accentDim : c.border }]} />
                      </View>
                      <Text style={styles.barLabel} numberOfLines={1}>{width < 500 ? week.label.split(' ')[0] : week.label}</Text>
                    </View>
                  ))}
                </View>
                <View style={styles.chartLegend}><View style={styles.legendDot} /><Text style={styles.legendText}>Cette semaine</Text></View>
              </View>
              <Pressable
                onPress={() => router.push('/history/volume')}
                accessibilityRole="button"
                accessibilityLabel="Explorer le volume hebdomadaire par muscle"
                style={({ pressed }) => [styles.volumeCard, width >= 1120 && { flex: 1 }, pressed && { opacity: 0.75 }]}
              >
                <View style={styles.volumeCopy}>
                  <Badge label="7 DERNIERS JOURS" tone="accent" />
                  <Text style={styles.volumeTitle}>L'équilibre\nfait la force.</Text>
                  <Text style={type.small}>Visualise les muscles travaillés et ajuste ta prochaine séance.</Text>
                  <View style={styles.volumeAction}><Text style={styles.volumeActionText}>Explorer mon volume</Text><Icon name="arrow-forward" size={18} color={c.accent} /></View>
                </View>
                <BodyMap highlights={highlights} view="both" size={47} />
              </Pressable>
            </View>
            <View style={styles.journalHead}>
              <View style={styles.sectionHeading}>
                <Text style={type.h2}>Ton journal d'entraînement</Text>
                <Text style={styles.journalCount}>{filtered.length}{sessions.length === limit ? '+' : ''}</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filters}>
                <Chip label="Tout" active={period === null} onPress={() => setPeriod(null)} />
                <Chip label="7 jours" active={period === 7} onPress={() => setPeriod(7)} />
                <Chip label="30 jours" active={period === 30} onPress={() => setPeriod(30)} />
                <Chip label="90 jours" active={period === 90} onPress={() => setPeriod(90)} />
                <View style={styles.filterDivider} />
                <Chip label="Avec un record" active={recordsOnly} onPress={() => setRecordsOnly((value) => !value)} />
              </ScrollView>
            </View>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon={sessions.length ? 'calendar-outline' : 'trending-up-outline'}
            title={sessions.length ? 'Une page encore blanche.' : 'Ton premier chapitre t’attend.'}
            body={sessions.length ? 'Aucune séance avec ces filtres. Explore une autre période pour retrouver tes entraînements.' : 'Lance une séance, valide tes premières séries et commence à voir ta progression ici.'}
            action={<Button label={sessions.length ? 'Voir toutes mes séances' : 'Choisir ma séance'} icon={sessions.length ? 'refresh-outline' : 'arrow-forward'} onPress={() => {
              if (sessions.length) { setPeriod(null); setRecordsOnly(false); }
              else router.push('/routines');
            }} />}
          />
        }
        ListFooterComponent={sessions.length === limit ? <Button label="Afficher plus de séances" variant="secondary" onPress={() => setLimit((count) => count + 200)} /> : filtered.length ? <Text style={styles.endNote}>Chaque séance compte. Continue d'écrire la suite.</Text> : null}
        renderItem={({ item }) => <SessionRow item={item} compact={width < 700} onPress={() => router.push(`/history/${item.id}`)} />}
      />
    </Screen>
  );
}

function Metric({ label, value, note, icon, accent = false }: {
  label: string; value: string; note: string; icon: 'barbell-outline' | 'layers-outline' | 'trophy-outline'; accent?: boolean;
}) {
  return <View style={styles.metric}>
    <View style={styles.metricTop}><Text style={styles.metricLabel}>{label}</Text><Icon name={icon} size={17} color={accent ? c.accent : c.textFaint} /></View>
    <Text style={[styles.metricValue, accent && { color: c.accent }]} adjustsFontSizeToFit numberOfLines={1}>{value}</Text>
    <Text style={styles.metricNote}>{note}</Text>
  </View>;
}

function SessionRow({ item, compact, onPress }: { item: SessionSummary; compact: boolean; onPress: () => void }) {
  const date = new Date(item.startedAt);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${item.routineName}, ${longDate(item.startedAt)}`} onPress={onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.surfaceAlt }]}>
      <View style={styles.dateBlock}>
        <Text style={styles.dateDay}>{date.getDate()}</Text>
        <Text style={styles.dateMonth}>{date.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')}</Text>
        <Text style={styles.dateYear}>{date.getFullYear()}</Text>
      </View>
      <View style={styles.rowMain}>
        <View style={styles.rowTitleLine}>
          <Text style={styles.rowTitle} numberOfLines={1}>{item.routineName}</Text>
          {!item.endedAt ? <Badge label="EN COURS" tone="ok" /> : null}
        </View>
        <Text style={styles.rowMeta}>{plural(item.exerciseCount, 'exercice')} · {plural(item.setCount, 'série')}{compact ? ` · ${tonnageLabel(item.tonnage)}${item.durationMin !== null ? ` · ${duration(item.durationMin)}` : ''}` : ''}</Text>
        {compact && item.prCount > 0 ? <View style={styles.rowBadge}><Badge label={plural(item.prCount, 'record')} tone="pr" icon="trophy" /></View> : null}
      </View>
      {!compact && <View style={styles.rowStats}><Text style={styles.rowTonnage}>{tonnageLabel(item.tonnage)}</Text><Text style={styles.rowDuration}>{item.durationMin !== null ? duration(item.durationMin) : 'En cours'}</Text></View>}
      {!compact && <View style={styles.prCell}>{item.prCount > 0 ? <Badge label={plural(item.prCount, 'record')} tone="pr" icon="trophy" /> : <Text style={styles.noRecord}>—</Text>}</View>}
      <Icon name="chevron-forward" size={17} color={c.textFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: space.lg, paddingBottom: 40, gap: 10 },
  listDesktop: { padding: 32 },
  header: { gap: 24, marginBottom: 6 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metric: { flex: 1, minWidth: 140, backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: 20, gap: 12 },
  metricTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  metricLabel: { ...type.overline, fontSize: 9, letterSpacing: 1, flex: 1 },
  metricValue: { ...font.display, ...font.tabular, color: c.text, fontSize: 42, lineHeight: 46 },
  metricNote: { color: c.textFaint, fontSize: 11, lineHeight: 16 },
  insights: { gap: 16 },
  insightsWide: { flexDirection: 'row', alignItems: 'stretch' },
  activityCard: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.xl, padding: 24, minWidth: 0 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginTop: 24 },
  barColumn: { flex: 1, alignItems: 'center', gap: 8, minWidth: 0 },
  barValue: { ...font.tabular, color: c.textDim, fontSize: 11, fontWeight: '600' },
  barTrack: { height: 92, width: '100%', maxWidth: 42, backgroundColor: c.bg, borderRadius: 5, justifyContent: 'flex-end', overflow: 'hidden' },
  bar: { width: '100%', borderRadius: 4 },
  barLabel: { color: c.textFaint, fontSize: 9 },
  chartLegend: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 18, justifyContent: 'flex-end' },
  legendDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.accent },
  legendText: { color: c.textDim, fontSize: 10 },
  volumeCard: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.xl, padding: 24, flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 },
  volumeCopy: { flex: 1, alignItems: 'flex-start', gap: 12 },
  volumeTitle: { ...font.display, color: c.text, fontSize: 34, lineHeight: 35 },
  volumeAction: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8, flexWrap: 'wrap' },
  volumeActionText: { color: c.accent, fontSize: 12, fontWeight: '700' },
  journalHead: { gap: 16, marginTop: 8 },
  journalCount: { ...font.tabular, color: c.textFaint, fontSize: 14 },
  filterScroll: { flexGrow: 0, flexShrink: 0 },
  filters: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  filterDivider: { width: 1, height: 24, backgroundColor: c.border, marginHorizontal: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 18, backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: 18 },
  dateBlock: { width: 48, alignItems: 'center', gap: 2, paddingVertical: 6, borderRadius: 12, backgroundColor: c.surfaceAlt },
  dateDay: { ...font.display, ...font.tabular, color: c.text, fontSize: 26, lineHeight: 28 },
  dateMonth: { color: c.textDim, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 },
  dateYear: { color: c.textFaint, fontSize: 8 },
  rowMain: { flex: 1, minWidth: 0, gap: 6 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  rowTitle: { color: c.text, fontSize: 16, fontWeight: '600', flexShrink: 1 },
  rowMeta: { color: c.textFaint, fontSize: 11, lineHeight: 17 },
  rowBadge: { alignItems: 'flex-start', marginTop: 2 },
  rowStats: { width: 110, alignItems: 'flex-end', gap: 5 },
  rowTonnage: { ...font.tabular, color: c.text, fontSize: 14, fontWeight: '600' },
  rowDuration: { color: c.textFaint, fontSize: 11 },
  prCell: { width: 110, alignItems: 'flex-end' },
  noRecord: { color: c.textFaint, fontSize: 15 },
  endNote: { color: c.textFaint, fontSize: 12, textAlign: 'center', marginTop: 20, marginBottom: 8 },
});
