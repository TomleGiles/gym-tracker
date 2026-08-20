import { useRouter } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge, Button, Card, EmptyState, Icon, Screen, Stat, Title } from '../../components/ui';
import { useQuery } from '../../db/client';
import { getDashboard, listSessions } from '../../db/queries/stats';
import { duration, longDate, plural, tonnageLabel } from '../../lib/format';
import { c, font, radius, space } from '../../lib/theme';
import { exportBackup } from '../../lib/backup';

export default function HistoryScreen() {
  const router = useRouter();
  const sessions = useQuery(() => listSessions(200), []);
  const dashboard = useQuery(() => getDashboard(), []);

  return (
    <Screen>
      <View style={styles.header}>
        <Title>Historique</Title>
        <Button label="Exporter" icon="download-outline" variant="secondary" onPress={exportBackup} />
      </View>

      <FlatList
        data={sessions}
        keyExtractor={(s) => s.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          sessions.length ? (
            <View style={styles.headerCards}>
              <Card>
                <View style={styles.statRow}>
                  <Stat value={String(sessions.length)} label="Séances" />
                  <Stat
                    value={tonnageLabel(sessions.reduce((a, s) => a + s.tonnage, 0))}
                    label="Tonnage total"
                  />
                  <Stat
                    value={String(dashboard.prsThisMonth)}
                    label="Records (30 j)"
                    tone={dashboard.prsThisMonth ? 'accent' : 'default'}
                  />
                </View>
              </Card>
              <Pressable onPress={() => router.push('/history/volume')}>
                {({ pressed }) => (
                  <Card style={[styles.volumeLink, pressed && { opacity: 0.7 }]}>
                    <Icon name="body" size={20} color={c.accent} />
                    <Text style={styles.volumeLinkLabel}>Volume hebdo par muscle</Text>
                    <Icon name="chevron-forward" size={18} />
                  </Card>
                )}
              </Pressable>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            icon="stats-chart"
            title="Aucune séance enregistrée"
            body="Lance une séance depuis l'accueil : elle apparaîtra ici dès la première série validée."
          />
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/history/${item.id}`)}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.65 }]}
          >
            <View style={styles.rowMain}>
              <View style={styles.rowTitleLine}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.routineName}
                </Text>
                {item.prCount > 0 ? <Badge label={`${item.prCount} PR`} tone="pr" /> : null}
                {!item.endedAt ? <Badge label="en cours" tone="ok" /> : null}
              </View>
              <Text style={styles.rowDate}>{longDate(item.startedAt)}</Text>
              <Text style={[styles.rowMeta, font.tabular]}>
                {plural(item.exerciseCount, 'exercice')} · {plural(item.setCount, 'série')} ·{' '}
                {tonnageLabel(item.tonnage)}
                {item.durationMin !== null ? ` · ${duration(item.durationMin)}` : ''}
              </Text>
            </View>
            <Icon name="chevron-forward" size={16} color={c.textFaint} />
          </Pressable>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.md,
    gap: space.md,
  },
  headerCards: { gap: space.md, marginBottom: space.md },
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.sm },
  statRow: { flexDirection: 'row', gap: space.md },
  volumeLink: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  volumeLinkLabel: { flex: 1, color: c.text, fontSize: 15, fontWeight: '600' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: c.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    padding: space.lg,
  },
  rowMain: { flex: 1, gap: 3 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  rowTitle: { color: c.text, fontSize: 16, fontWeight: '700', flexShrink: 1 },
  rowDate: { color: c.textDim, fontSize: 13, textTransform: 'capitalize' },
  rowMeta: { color: c.textFaint, fontSize: 12 },
});
