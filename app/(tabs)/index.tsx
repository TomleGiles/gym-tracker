import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BodyMap, highlightsFromIntensities } from '../../components/BodyMap/BodyMap';
import { ProgramPicker } from '../../components/ProgramPicker';
import { RecordCard, WeekCard } from '../../components/Progress';
import { Text } from '../../components/Text';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Glow,
  Icon,
  Screen,
  SectionTitle,
  Stat,
} from '../../components/ui';
import { useQuery } from '../../db/client';
import { getSignedInAccount } from '../../db/queries/auth';
import { getNextRoutine, getRecentRecords, getWeekActivity } from '../../db/queries/engagement';
import type { NextRoutine } from '../../db/queries/engagement';
import { getActiveSession, startSession } from '../../db/queries/sessions';
import { getDashboard, getMuscleVolume } from '../../db/queries/stats';
import type { Session } from '../../db/schema';
import { clockTime, duration, plural, relativeDay, tonnageLabel } from '../../lib/format';
import { c, font, radius, space, type } from '../../lib/theme';
import { volumeIntensity } from '../../lib/volume';
import { useActiveSession } from '../../stores/activeSession';

export default function HomeScreen() {
  const router = useRouter();
  const resetSessionUi = useActiveSession((s) => s.reset);

  const account = useQuery(() => getSignedInAccount(), []);
  const active = useQuery(() => getActiveSession(), []);
  const next = useQuery(() => getNextRoutine(), []);
  const week = useQuery(() => getWeekActivity(), []);
  const records = useQuery(() => getRecentRecords(), []);
  const dashboard = useQuery(() => getDashboard(), []);
  const volume = useQuery(() => getMuscleVolume(7), []);

  const highlights = highlightsFromIntensities(
    volume.map((v) => ({ muscle: v.muscle, intensity: volumeIntensity(v.sets) })),
  );

  function launch(routineId: string | null) {
    resetSessionUi();
    router.push(`/session/${startSession(routineId)}`);
  }

  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <Screen scroll>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text style={type.overline}>{today}</Text>
          <Text style={type.title} numberOfLines={1}>
            {greeting()}
            {account ? `, ${account.displayName.split(' ')[0]}` : ''}
          </Text>
        </View>
        {account ? (
          <Pressable
            onPress={() => router.push('/profile')}
            accessibilityRole="button"
            accessibilityLabel="Profil"
          >
            <Avatar name={account.displayName} size={44} />
          </Pressable>
        ) : null}
      </View>

      {active ? (
        <ResumeHero session={active} onResume={() => router.push(`/session/${active.id}`)} />
      ) : next ? (
        <NextHero
          next={next}
          onStart={() => launch(next.id)}
          onPickOther={() => router.push('/routines')}
          onFree={() => launch(null)}
        />
      ) : (
        <ProgramPicker onFree={() => launch(null)} />
      )}

      <WeekCard week={week} streakWeeks={dashboard.streakWeeks} />

      {records.length ? (
        <>
          <SectionTitle>Records récents</SectionTitle>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.recordsRow}
            style={styles.recordsScroller}
          >
            {records.map((r) => (
              <RecordCard key={r.exerciseId} record={r} onPress={() => router.push(`/exercises/${r.exerciseId}`)} />
            ))}
          </ScrollView>
        </>
      ) : null}

      {dashboard.setsThisWeek > 0 ? (
        <>
          <SectionTitle>7 derniers jours</SectionTitle>
          <Card onPress={() => router.push('/history/volume')}>
            <View style={styles.statRow}>
              <Stat value={String(dashboard.setsThisWeek)} label="Séries" />
              <Stat value={tonnageLabel(dashboard.tonnageThisWeek)} label="Tonnage" />
              <Stat
                value={String(dashboard.prsThisMonth)}
                label="Records (30 j)"
                tone={dashboard.prsThisMonth > 0 ? 'pr' : 'default'}
              />
            </View>
            <View style={styles.divider} />
            <View style={styles.coverageHead}>
              <Text style={type.h3}>Muscles travaillés</Text>
              <View style={styles.linkRow}>
                <Text style={styles.link}>Volume</Text>
                <Icon name="arrow-forward" size={14} color={c.accent} />
              </View>
            </View>
            <View style={styles.coverage}>
              <BodyMap highlights={highlights} view="both" size={120} />
            </View>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Bonsoir';
  if (h < 18) return 'Salut';
  return 'Bonsoir';
}

/* ------------------------------------------------------------------ */

function NextHero({
  next,
  onStart,
  onPickOther,
  onFree,
}: {
  next: NextRoutine;
  onStart: () => void;
  onPickOther: () => void;
  onFree: () => void;
}) {
  const shown = next.exerciseLabels.slice(0, 3);
  const more = next.exerciseLabels.length - shown.length;
  return (
    <View style={styles.hero}>
      <Glow color={next.color ?? c.accent} style={styles.heroGlow} />
      <View style={styles.heroTop}>
        <Badge label="Prochaine séance" tone="accent" icon="flash" />
        <Text style={styles.heroWhen}>
          {next.lastDoneAt ? `Dernière fois ${relativeDay(next.lastDoneAt)}` : 'Jamais faite'}
        </Text>
      </View>
      <Text style={styles.heroName} numberOfLines={1}>
        {next.name}
      </Text>
      <Text style={styles.heroMeta}>
        {plural(next.exerciseLabels.length, 'exercice')} · {next.totalSets} séries · ~{duration(next.estimatedMin)}
      </Text>
      <View style={styles.heroList}>
        {shown.map((label) => (
          <View key={label} style={styles.heroItem}>
            <View style={[styles.heroBullet, { backgroundColor: next.color ?? c.accent }]} />
            <Text style={styles.heroItemText} numberOfLines={1}>
              {label}
            </Text>
          </View>
        ))}
        {more > 0 ? <Text style={styles.heroMore}>+ {plural(more, 'autre exercice', 'autres exercices')}</Text> : null}
      </View>
      <Button label="Démarrer" icon="play" size="lg" onPress={onStart} />
      <View style={styles.heroAlt}>
        <Pressable onPress={onPickOther} hitSlop={8} style={styles.heroAltBtn}>
          <Icon name="albums-outline" size={16} color={c.textDim} />
          <Text style={styles.heroAltText}>Autre séance</Text>
        </Pressable>
        <View style={styles.heroAltSep} />
        <Pressable onPress={onFree} hitSlop={8} style={styles.heroAltBtn}>
          <Icon name="add" size={16} color={c.textDim} />
          <Text style={styles.heroAltText}>Séance libre</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ResumeHero({ session, onResume }: { session: Session; onResume: () => void }) {
  const minutes = Math.max(1, Math.round((Date.now() - Date.parse(session.startedAt)) / 60000));
  return (
    <View style={[styles.hero, styles.heroLive]}>
      <View style={styles.heroTop}>
        <View style={styles.liveRow}>
          <View style={styles.liveDot} />
          <Text style={styles.liveLabel}>En cours</Text>
        </View>
        <Text style={styles.heroWhen}>
          Depuis {clockTime(session.startedAt)} · {duration(minutes)}
        </Text>
      </View>
      <Text style={styles.heroName} numberOfLines={1}>
        {session.routineName}
      </Text>
      <Text style={styles.heroMeta}>Ta séance t'attend là où tu l'as laissée.</Text>
      <Button label="Reprendre" icon="play" size="lg" onPress={onResume} style={{ marginTop: space.md }} />
    </View>
  );
}

/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.xs },

  hero: {
    backgroundColor: c.surface,
    borderRadius: radius.xl,
    padding: space.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: c.border,
  },
  heroLive: { borderColor: c.accent },
  // Halo dans le coin : la couleur du modèle de séance, très diluée.
  heroGlow: { top: -170, right: -150 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  heroWhen: { ...type.caption, flexShrink: 1, textAlign: 'right' },
  heroName: { ...type.hero, fontSize: 52, lineHeight: 56, marginTop: space.md },
  heroMeta: { ...type.small, marginTop: 2 },
  heroList: { gap: 6, marginTop: space.lg, marginBottom: space.xl },
  heroItem: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  heroBullet: { width: 6, height: 6, borderRadius: 3 },
  heroItemText: { color: c.text, fontSize: 15, fontWeight: '500', flex: 1 },
  heroMore: { ...type.caption, marginLeft: 14 },
  heroAlt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.lg,
    marginTop: space.md,
  },
  heroAltBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32 },
  heroAltText: { color: c.textDim, fontSize: 14, fontWeight: '600' },
  heroAltSep: { width: 1, height: 16, backgroundColor: c.border },

  liveRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.accent },
  liveLabel: { ...type.overline, color: c.accent },



  recordsScroller: { marginHorizontal: -space.lg },
  recordsRow: { paddingHorizontal: space.lg, gap: space.sm },

  statRow: { flexDirection: 'row', gap: space.md },
  divider: { height: 1, backgroundColor: c.border, marginVertical: space.lg },
  coverageHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  coverage: { alignItems: 'center', marginTop: space.md },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  link: { color: c.accent, fontSize: 14, fontWeight: '600' },
});
