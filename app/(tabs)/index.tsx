import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BodyMap, highlightsFromIntensities } from '../../components/BodyMap/BodyMap';
import { Button, Card, EmptyState, Icon, Screen, SectionTitle, Stat, Title } from '../../components/ui';
import { useQuery } from '../../db/client';
import { getSignedInAccount } from '../../db/queries/auth';
import { listRoutines } from '../../db/queries/routines';
import { getActiveSession, startSession } from '../../db/queries/sessions';
import { getDashboard, getMuscleVolume } from '../../db/queries/stats';
import { clockTime, duration, plural, relativeDay, tonnageLabel } from '../../lib/format';
import { c, radius, space } from '../../lib/theme';
import { volumeIntensity } from '../../lib/volume';
import { useActiveSession } from '../../stores/activeSession';

export default function HomeScreen() {
  const router = useRouter();
  const resetSessionUi = useActiveSession((s) => s.reset);

  const account = useQuery(() => getSignedInAccount(), []);
  const active = useQuery(() => getActiveSession(), []);
  const routines = useQuery(() => listRoutines(), []);
  const dashboard = useQuery(() => getDashboard(), []);
  const volume = useQuery(() => getMuscleVolume(7), []);

  const highlights = highlightsFromIntensities(
    volume.map((v) => ({ muscle: v.muscle, intensity: volumeIntensity(v.sets) })),
  );

  function launch(routineId: string | null) {
    resetSessionUi();
    const id = startSession(routineId);
    router.push(`/session/${id}`);
  }

  return (
    <Screen scroll>
      {account ? <Text style={styles.greeting}>Salut {account.displayName} 👋</Text> : null}
      <Title>Muscu Tracker</Title>

      {active ? (
        // §5 : « la séance survit à un kill de l'app » — c'est ici qu'on la récupère.
        <Card style={styles.resume}>
          <View style={styles.resumeHead}>
            <View style={styles.liveDot} />
            <Text style={styles.resumeLabel}>Séance en cours</Text>
          </View>
          <Text style={styles.resumeName}>{active.routineName}</Text>
          <Text style={styles.resumeMeta}>
            Démarrée à {clockTime(active.startedAt)} ·{' '}
            {duration(Math.max(1, Math.round((Date.now() - Date.parse(active.startedAt)) / 60000)))}
          </Text>
          <Button
            label="Reprendre"
            icon="play"
            size="lg"
            onPress={() => router.push(`/session/${active.id}`)}
            style={{ marginTop: space.md }}
          />
        </Card>
      ) : (
        <Card>
          <Text style={styles.startTitle}>Lancer une séance</Text>
          {routines.length ? (
            <View style={styles.routineGrid}>
              {routines.map((r) => (
                <Pressable
                  key={r.id}
                  onPress={() => launch(r.id)}
                  style={({ pressed }) => [styles.routineChip, pressed && { opacity: 0.6 }]}
                >
                  <View style={[styles.dot, { backgroundColor: r.color ?? c.textFaint }]} />
                  <View style={styles.flex}>
                    <Text style={styles.routineName} numberOfLines={1}>
                      {r.name}
                    </Text>
                    <Text style={styles.routineMeta}>{plural(r.itemCount, 'exercice')}</Text>
                  </View>
                  <Icon name="play" size={16} color={c.textDim} />
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={styles.hint}>
              Aucun modèle de séance pour l'instant. Tu peux démarrer une séance libre et ajouter
              les exercices au fil de l'eau.
            </Text>
          )}
          <Button
            label="Séance libre"
            variant="secondary"
            icon="add"
            onPress={() => launch(null)}
            style={{ marginTop: space.md }}
          />
        </Card>
      )}

      <SectionTitle>7 derniers jours</SectionTitle>
      <Card>
        <View style={styles.statRow}>
          <Stat value={String(dashboard.sessionsThisWeek)} label="Séances" />
          <Stat value={String(dashboard.setsThisWeek)} label="Séries" />
          <Stat value={tonnageLabel(dashboard.tonnageThisWeek)} label="Tonnage" />
          <Stat
            value={String(dashboard.prsThisMonth)}
            label="Records (30 j)"
            tone={dashboard.prsThisMonth > 0 ? 'accent' : 'default'}
          />
        </View>
      </Card>

      <Pressable onPress={() => router.push('/history/volume')}>
        {({ pressed }) => (
          <Card style={pressed ? { opacity: 0.7 } : undefined}>
            <View style={styles.volumeHead}>
              <Text style={styles.startTitle}>Couverture musculaire</Text>
              <Icon name="chevron-forward" size={18} />
            </View>
            {dashboard.setsThisWeek === 0 ? (
              <EmptyState
                icon="body"
                title="Rien cette semaine"
                body="Le petit bonhomme s'allume au fur et à mesure que tu enregistres des séries."
              />
            ) : (
              <View style={styles.bodyWrap}>
                <BodyMap highlights={highlights} view="both" size={124} />
              </View>
            )}
          </Card>
        )}
      </Pressable>

      {dashboard.streakWeeks > 1 ? (
        <Text style={styles.streak}>
          {dashboard.streakWeeks} semaines d'affilée avec au moins une séance.
        </Text>
      ) : null}

      <Text style={styles.footer}>
        {active
          ? `Séance ouverte ${relativeDay(active.startedAt)}.`
          : 'Toutes les données restent sur cet appareil.'}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  greeting: { color: c.textDim, fontSize: 15, fontWeight: '600', marginBottom: -space.sm },
  resume: { borderColor: c.accent, borderWidth: 1.5 },
  resumeHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.accent },
  resumeLabel: {
    color: c.accent,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  resumeName: { color: c.text, fontSize: 22, fontWeight: '800', marginTop: space.sm },
  resumeMeta: { color: c.textDim, fontSize: 13, marginTop: 2 },

  startTitle: { color: c.text, fontSize: 16, fontWeight: '700' },
  routineGrid: { gap: space.sm, marginTop: space.md },
  routineChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: c.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  routineName: { color: c.text, fontSize: 15, fontWeight: '600' },
  routineMeta: { color: c.textFaint, fontSize: 12 },
  hint: { color: c.textDim, fontSize: 14, lineHeight: 20, marginTop: space.sm },

  statRow: { flexDirection: 'row', gap: space.md },

  volumeHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bodyWrap: { alignItems: 'center', marginTop: space.md },

  streak: { color: c.ok, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  footer: { color: c.textFaint, fontSize: 12, textAlign: 'center', marginTop: space.sm },
});
