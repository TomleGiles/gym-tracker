import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Brand, TrainingArtwork } from '../../components/Brand';
import { BodyMap, highlightsFromIntensities } from '../../components/BodyMap/BodyMap';
import { RecordCard, WeekCard } from '../../components/Progress';
import { Text } from '../../components/Text';
import { Avatar, Badge, Button, Card, Glow, Icon, PageHeader, Screen, SectionTitle } from '../../components/ui';
import type { IconName } from '../../components/ui';
import { useQuery } from '../../db/client';
import { getSignedInAccount } from '../../db/queries/auth';
import { getNextRoutine, getRecentRecords, getWeekActivity } from '../../db/queries/engagement';
import { getActiveSession, startSession } from '../../db/queries/sessions';
import { getDashboard, getMuscleVolume, listSessions } from '../../db/queries/stats';
import { duration, plural, relativeDay, tonnageLabel } from '../../lib/format';
import { c, font, radius, type } from '../../lib/theme';
import { volumeIntensity } from '../../lib/volume';
import { useActiveSession } from '../../stores/activeSession';

export default function HomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const wide = width >= 1180;
  const mobile = width < 650;
  const resetSessionUi = useActiveSession((s) => s.reset);
  const account = useQuery(() => getSignedInAccount(), []);
  const active = useQuery(() => getActiveSession(), []);
  const next = useQuery(() => getNextRoutine(), []);
  const week = useQuery(() => getWeekActivity(), []);
  const records = useQuery(() => getRecentRecords(4), []);
  const dashboard = useQuery(() => getDashboard(), []);
  const volume = useQuery(() => getMuscleVolume(7), []);
  const recent = useQuery(() => listSessions(8).filter((s) => s.endedAt).slice(0, 3), []);
  const trained = volume.filter((v) => v.sets > 0);
  const highlights = highlightsFromIntensities(volume.map((v) => ({ muscle: v.muscle, intensity: volumeIntensity(v.sets) })));

  function launch(routineId: string | null) {
    if (active) { router.push(`/session/${active.id}`); return; }
    resetSessionUi();
    router.push(`/session/${startSession(routineId)}`);
  }

  return <Screen scroll>
    {width < 1000 ? <View style={s.mobileBrand}><Brand /><Pressable accessibilityRole="button" accessibilityLabel="Mon profil" onPress={() => router.push('/profile')}><Avatar name={account?.displayName ?? 'A'} size={36} /></Pressable></View> : null}
    <PageHeader eyebrow="TON PROCHAIN NIVEAU COMMENCE ICI" title={`${new Date().getHours() >= 18 ? 'Bonsoir' : 'Salut'}${account ? `, ${account.displayName.split(' ')[0]}` : ''} 👋`} subtitle="Un peu plus fort. Une séance à la fois."
      action={!mobile ? <Button label={active ? 'Reprendre ma séance' : 'Séance libre'} icon={active ? 'play' : 'add'} variant="secondary" onPress={() => launch(null)} /> : undefined} />

    <View style={[s.topGrid, wide && s.row]}>
      <View style={[s.hero, wide && { flex: 1.75 }]}>
        <Glow color={c.accent} size={480} style={{ top: -200, right: -140 }} />
        <View pointerEvents="none" style={[s.heroArt, mobile && s.heroArtMobile]}><TrainingArtwork /></View>
        <View style={[s.heroContent, mobile && { maxWidth: '100%' }]}>
          <View style={s.heroEyebrow}><View style={s.liveDot} /><Text style={s.heroEyebrowText}>{active ? 'TA SÉANCE EST EN COURS' : next ? 'AU PROGRAMME AUJOURD’HUI' : 'LE DÉPART D’UNE NOUVELLE VERSION DE TOI'}</Text></View>
          <Text style={[s.heroTitle, mobile && { fontSize: 47, lineHeight: 48 }]} numberOfLines={2}>{active?.routineName ?? next?.name ?? 'CONSTRUIS\nTA FORCE.'}</Text>
          <Text style={s.heroSubtitle}>{active ? 'Retrouve tes séries exactement là où tu les as laissées.' : next ? `${plural(next.exerciseLabels.length, 'exercice')}  ·  ${next.totalSets} séries  ·  ≈ ${duration(next.estimatedMin)}` : 'Tes entraînements, tes records, ta progression. Tout commence par une première séance.'}</Text>
          {next && !active ? <View style={s.heroExercises}>{next.exerciseLabels.slice(0, 2).map((label, i) => <Text style={s.heroExercise} key={label} numberOfLines={1}><Text style={{ color: c.accent }}>0{i + 1}   </Text>{label}</Text>)}</View> : null}
          <View style={s.heroActions}>
            <Button label={active ? 'Reprendre ma séance' : next ? 'Lancer la séance' : 'Choisir mon programme'} icon={active || next ? 'play' : 'arrow-forward'} size="lg" onPress={() => active ? router.push(`/session/${active.id}`) : next ? launch(next.id) : router.push('/routines')} />
            <Pressable accessibilityRole="button" onPress={() => next || active ? router.push('/routines') : launch(null)} style={s.heroLink}><Text style={s.heroLinkText}>{next || active ? 'Voir mes séances' : 'Ou commencer une séance libre'}</Text><Icon name="arrow-forward" size={14} /></Pressable>
          </View>
        </View>
        <Text style={s.heroIndex}>TRAKR / SUIVI D’ENTRAÎNEMENT</Text>
      </View>
      <View style={[s.weekColumn, wide && { flex: 1 }]}>
        <WeekCard week={week} streakWeeks={dashboard.streakWeeks} />
        <Pressable accessibilityRole="button" onPress={() => router.push('/profile')} style={s.goalLink}><Text style={type.caption}>Un rythme qui te ressemble</Text><Text style={s.smallLink}>Ajuster mon objectif <Icon name="arrow-forward" size={12} color={c.accent} /></Text></Pressable>
      </View>
    </View>

    <View style={s.sectionHeading}><Text style={type.h3}>Ton activité en chiffres</Text><Text style={type.caption}>7 derniers jours</Text></View>
    <View style={s.metrics}>
      <Metric icon="barbell-outline" value={String(dashboard.sessionsThisWeek)} label="Séances" note="La régularité fait la différence" color={c.accent} mobile={mobile} onPress={() => router.push('/history')} />
      <Metric icon="layers-outline" value={String(dashboard.setsThisWeek)} label="Séries réalisées" note="Chaque répétition compte" color={c.info} mobile={mobile} onPress={() => router.push('/history')} />
      <Metric icon="trending-up-outline" value={tonnageLabel(dashboard.tonnageThisWeek)} label="Volume soulevé" note="Ton travail, rendu visible" color="#BAA4F4" mobile={mobile} onPress={() => router.push('/history/volume')} />
      <Metric icon="trophy-outline" value={String(dashboard.prsThisMonth)} label="Records personnels" note="Sur les 30 derniers jours" color={c.pr} mobile={mobile} onPress={() => router.push('/history')} />
    </View>

    <View style={[s.bottomGrid, wide && s.row]}>
      <Card style={[s.muscleCard, wide && { flex: 1 }]}>
        <View style={s.sectionHeading}><View style={{ gap: 4 }}><Text style={type.h3}>Ton empreinte musculaire</Text><Text style={type.caption}>Volume des 7 derniers jours</Text></View><View style={s.iconBox}><Icon name="body-outline" color={c.accent} /></View></View>
        {/* Sur téléphone, la légende passe sous le corps : à côté, elle n'avait que quelques mots par ligne. */}
        <View style={[s.muscleBody, mobile && s.muscleBodyMobile]}>
          <View style={s.bodyMap}><BodyMap highlights={highlights} view="both" size={100} /></View>
          <View style={[s.muscleLegend, mobile && s.muscleLegendMobile]}>
            {trained.length ? trained.slice(0, 4).map(({ muscle, sets }) => <View key={muscle.id} style={s.muscleItem}><View style={s.muscleLabel}><Text numberOfLines={1} style={s.muscleName}>{muscle.labelFr}</Text><Text style={s.muscleSets}>{Number(sets.toFixed(1))}</Text></View><View style={s.volumeTrack}><View style={[s.volumeFill, { width: `${Math.max(4, (sets / (trained[0]?.sets || 1)) * 100)}%` }]} /></View></View>) : <><Text style={[s.muscleEmptyTitle, mobile && s.centered]}>Visualise ton effort.</Text><Text style={[type.small, mobile && s.centered]}>Tes muscles travaillés s’illuminent au fil de tes séances.</Text></>}
          </View>
        </View>
        <Button label="Explorer mon volume" variant="secondary" icon="analytics-outline" onPress={() => router.push('/history/volume')} />
      </Card>
      <Card style={[s.activityCard, wide && { flex: 1 }]}>
        <View style={s.sectionHeading}><View style={{ gap: 4 }}><Text style={type.h3}>Dernières séances</Text><Text style={type.caption}>Les petits pas font les grands progrès</Text></View><Icon name="time-outline" /></View>
        {recent.length ? <View style={s.activityList}>{recent.map((session) => <Pressable accessibilityRole="button" key={session.id} onPress={() => router.push(`/history/${session.id}`)} style={({ pressed }) => [s.activityRow, pressed && { opacity: 0.65 }]}><View style={s.activityIcon}><Icon name="barbell-outline" size={20} color={c.accent} /></View><View style={{ flex: 1, gap: 5 }}><Text style={s.activityName} numberOfLines={1}>{session.routineName}</Text><Text style={type.caption}>{relativeDay(session.startedAt)} · {plural(session.setCount, 'série')} ·{duration(session.durationMin ?? 0)}</Text></View>{session.prCount ? <Badge label={`${session.prCount} PR`} tone="pr" /> : null}<Icon name="chevron-forward" size={15} /></Pressable>)}</View> : <View style={s.emptyActivity}><View style={s.emptyActivityIcon}><Icon name="fitness-outline" color={c.accent} size={34} /></View><Text style={s.emptyTitle}>La suite, c’est toi qui l’écris.</Text><Text style={[type.small, { textAlign: 'center', maxWidth: 280 }]}>Ta première séance marquera le début de ta progression.</Text></View>}
        <Button label="Toute ma progression" variant="ghost" icon="arrow-forward" onPress={() => router.push('/history')} />
      </Card>
    </View>

    {records.length ? <><SectionTitle right={<Badge label="30 derniers jours" tone="pr" />}>Tes dernières victoires</SectionTitle><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>{records.map((record) => <RecordCard key={record.exerciseId} record={record} onPress={() => router.push(`/exercises/${record.exerciseId}`)} />)}</ScrollView></> : null}
    <View style={s.footer}><Brand compact /><Text style={s.footerText}>LA SEULE COMPARAISON QUI COMPTE, C’EST AVEC TOI-MÊME.</Text></View>
  </Screen>;
}

function Metric({ icon, value, label, note, color, mobile, onPress }: { icon: IconName; value: string; label: string; note: string; color: string; mobile: boolean; onPress: () => void }) {
  return <Card onPress={onPress} style={[s.metric, mobile && { flexBasis: '46%' }]}><View style={s.metricHead}><View style={[s.metricIcon, { backgroundColor: `${color}12` }]}><Icon name={icon} color={color} size={18} /></View><Icon name="arrow-up-right-box-outline" size={14} color={c.textFaint} /></View><Text style={s.metricValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text><Text style={s.metricLabel}>{label}</Text>{!mobile ? <Text style={s.metricNote}>{note}</Text> : null}</Card>;
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'stretch' },
  mobileBrand: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 },
  topGrid: { gap: 20 },
  hero: { minHeight: 330, backgroundColor: '#182019', borderRadius: radius.xl, borderWidth: 1, borderColor: '#35432A', overflow: 'hidden', padding: 28 },
  heroArt: { position: 'absolute', width: 360, height: 305, right: -45, top: 8, opacity: 0.85 },
  heroArtMobile: { width: 285, height: 250, right: -112, top: 30, opacity: 0.35 },
  heroContent: { maxWidth: '75%', gap: 13, zIndex: 1 },
  heroEyebrow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  liveDot: { height: 6, width: 6, borderRadius: 3, backgroundColor: c.accent },
  heroEyebrowText: { color: c.accent, fontSize: 10, fontWeight: '700', letterSpacing: 1.2, flexShrink: 1 },
  heroTitle: { ...font.display, color: c.text, fontSize: 59, lineHeight: 60, letterSpacing: 0.2, textTransform: 'uppercase' },
  heroSubtitle: { color: '#B6C1AF', fontSize: 13, lineHeight: 20, maxWidth: 325 },
  heroExercises: { gap: 5 },
  heroExercise: { color: '#C8D0C1', fontSize: 12, lineHeight: 19 },
  heroActions: { alignSelf: 'flex-start', gap: 3, marginTop: 3 },
  heroLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44 },
  heroLinkText: { color: c.textDim, fontSize: 13, fontWeight: '500' },
  heroIndex: { position: 'absolute', bottom: 18, right: 20, fontSize: 9, color: '#728064', letterSpacing: 2 },
  weekColumn: { gap: 9, justifyContent: 'center' },
  goalLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', paddingHorizontal: 5, minHeight: 44 },
  smallLink: { color: c.accent, fontSize: 12, fontWeight: '600' },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  metric: { flex: 1, minWidth: 0, padding: 20, gap: 5 },
  metricHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  metricIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  metricValue: { ...font.display, color: c.text, fontSize: 40, lineHeight: 44 },
  metricLabel: { color: c.textDim, fontSize: 12, fontWeight: '500' },
  metricNote: { color: c.textFaint, fontSize: 10, marginTop: 8 },
  bottomGrid: { gap: 20 },
  muscleCard: { padding: 22, gap: 17 },
  iconBox: { backgroundColor: c.accentDim, width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  muscleBody: { flexDirection: 'row', alignItems: 'center', gap: 20, flex: 1 },
  bodyMap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  muscleBodyMobile: { flexDirection: 'column', alignItems: 'stretch', gap: 16 },
  muscleLegend: { flex: 1, gap: 17 },
  muscleLegendMobile: { flex: 0, gap: 12 },
  centered: { textAlign: 'center' },
  muscleItem: { gap: 7 },
  muscleLabel: { flexDirection: 'row', gap: 5, justifyContent: 'space-between' },
  muscleName: { color: c.textDim, fontSize: 12, flex: 1 },
  muscleSets: { color: c.accent, fontSize: 11, ...font.tabular },
  volumeTrack: { height: 4, backgroundColor: c.surfaceHigh, borderRadius: 2 },
  volumeFill: { height: 4, backgroundColor: c.accent, borderRadius: 2 },
  muscleEmptyTitle: { color: c.text, fontSize: 16, fontWeight: '600', lineHeight: 22 },
  activityCard: { padding: 22, gap: 14 },
  activityList: { flex: 1, justifyContent: 'center' },
  activityRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 19, borderBottomWidth: 1, borderBottomColor: c.border },
  activityIcon: { width: 42, height: 42, backgroundColor: c.surfaceAlt, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  activityName: { color: c.text, fontSize: 13, fontWeight: '600' },
  emptyActivity: { flex: 1, minHeight: 190, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyActivityIcon: { width: 64, height: 64, borderRadius: 22, backgroundColor: c.accentDim, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: c.text, fontWeight: '600', fontSize: 15, textAlign: 'center' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 16, opacity: 0.6 },
  footerText: { color: c.textFaint, fontSize: 10, letterSpacing: 1, flexShrink: 1 },
});
