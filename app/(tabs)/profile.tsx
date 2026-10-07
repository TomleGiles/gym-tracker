import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { Text } from '../../components/Text';
import { Avatar, Badge, Button, Card, Icon, IconButton, PageHeader, Screen, SectionTitle, Stat } from '../../components/ui';
import { useQuery } from '../../db/client';
import { getSignedInAccount, signOut } from '../../db/queries/auth';
import { WEEKLY_GOAL_RANGE, getWeeklyGoal, setWeeklyGoal } from '../../db/queries/engagement';
import { getDashboard, getLifetimeStats } from '../../db/queries/stats';
import { seedDemoData } from '../../db/seed/demo';
import { exportBackup } from '../../lib/backup';
import { confirmDialog } from '../../lib/confirm';
import { tonnageLabel } from '../../lib/format';
import { c, font, radius, space, type } from '../../lib/theme';

export default function ProfileScreen() {
  const account = useQuery(() => getSignedInAccount(), []);
  const lifetime = useQuery(() => getLifetimeStats(), []);
  const dashboard = useQuery(() => getDashboard(), []);
  const goal = useQuery(() => getWeeklyGoal(), []);
  const { width } = useWindowDimensions();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const wide = width >= 1080;

  // Le garde de app/_layout.tsx démonte cet écran dès la déconnexion.
  if (!account) return null;

  const since = new Date(account.createdAt).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  async function saveBackup() {
    if (exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      await exportBackup();
    } catch {
      setExportError("L'export n'a pas abouti. Réessaie dans un instant.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <Screen scroll>
      <PageHeader eyebrow="TON ESPACE" title="À ton rythme." subtitle="Tes objectifs. Tes habitudes. Ta progression." />

      <Card style={styles.identityCard}>
        <View style={styles.identity}>
          <Avatar name={account.displayName} size={76} />
          <View style={styles.flex}>
            <Text style={styles.name} numberOfLines={1}>{account.displayName}</Text>
            <Text style={type.small} numberOfLines={1}>{account.email}</Text>
            <View style={styles.memberRow}>
              <View style={styles.memberDot} />
              <Text style={styles.memberSince}>En mouvement depuis {since}</Text>
            </View>
          </View>
        </View>
        <View style={styles.identityBottom}>
          <Text style={styles.identitySignature}>LE SEUL ADVERSAIRE, C'EST HIER.</Text>
          <Badge label="Compte local" icon="shield-checkmark-outline" />
        </View>
      </Card>

      <View style={styles.statsGrid}>
        <View style={styles.statTile}><Icon name="barbell-outline" color={c.accent} size={18} /><Stat value={String(lifetime.sessions)} label="Séances terminées" size="lg" /></View>
        <View style={styles.statTile}><Icon name="layers-outline" color={c.textDim} size={18} /><Stat value={tonnageLabel(lifetime.tonnage)} label="Volume soulevé" size="lg" /></View>
        <View style={styles.statTile}><Icon name="trophy-outline" color={c.pr} size={18} /><Stat value={String(lifetime.prs)} label="Records personnels" tone={lifetime.prs ? 'pr' : 'default'} size="lg" /></View>
        <View style={styles.statTile}><Icon name="flame-outline" color={c.ok} size={18} /><Stat value={`${dashboard.streakWeeks} sem.`} label="De régularité" tone={dashboard.streakWeeks > 1 ? 'ok' : 'default'} size="lg" /></View>
      </View>

      <View style={[styles.columns, wide && styles.columnsWide]}>
        <View style={styles.column}>
          <SectionTitle>Ton rythme de croisière</SectionTitle>
          <Card style={styles.goalCard}>
            <View style={styles.cardHeading}>
              <View style={styles.iconBox}><Icon name="calendar-outline" size={21} color={c.accent} /></View>
              <View style={styles.flex}><Text style={type.h3}>Objectif hebdomadaire</Text><Text style={styles.description}>La régularité fait la différence.</Text></View>
            </View>
            <View style={styles.goalControl}>
              <IconButton name="remove" accessibilityLabel="Une séance de moins" color={c.text} disabled={goal <= WEEKLY_GOAL_RANGE.min} onPress={() => setWeeklyGoal(goal - 1)} style={styles.stepBtn} />
              <View style={styles.goalValueWrap}>
                <Text style={styles.goalValue} accessibilityLiveRegion="polite">{goal}</Text>
                <Text style={styles.goalLabel}>séance{goal > 1 ? 's' : ''} / semaine</Text>
              </View>
              <IconButton name="add" accessibilityLabel="Une séance de plus" color={c.text} disabled={goal >= WEEKLY_GOAL_RANGE.max} onPress={() => setWeeklyGoal(goal + 1)} style={styles.stepBtn} />
            </View>
            <View style={styles.presets}>
              {[2, 3, 4, 5].map((value) => (
                <Pressable key={value} onPress={() => setWeeklyGoal(value)} accessibilityRole="button" accessibilityLabel={`${value} séances par semaine`} accessibilityState={{ selected: value === goal }} style={({ pressed }) => [styles.preset, value === goal && styles.presetActive, pressed && { opacity: 0.7 }]}>
                  <Text style={[styles.presetLabel, value === goal && styles.presetLabelActive]}>{value} / sem.</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.goalHint}>Ajuste ton objectif quand tu veux. Il est enregistré automatiquement et visible sur ton tableau de bord.</Text>
          </Card>

          <Card style={styles.social}>
            <View style={styles.socialHeading}><Icon name="people-outline" size={22} color={c.textDim} /><Badge label="À venir" /></View>
            <Text style={type.h3}>Plus forts, ensemble.</Text>
            <Text style={styles.description}>Partager tes séances et suivre tes partenaires de salle : la prochaine étape, avec la synchronisation.</Text>
          </Card>
        </View>

        <View style={styles.column}>
          <SectionTitle>Tes données, ton contrôle</SectionTitle>
          <Card style={styles.dataCard}>
            <View style={styles.cardHeading}>
              <View style={styles.iconBox}><Icon name="phone-portrait-outline" size={21} color={c.accent} /></View>
              <View style={styles.flex}><Text style={type.h3}>Toujours avec toi</Text><Text style={styles.description}>Disponible hors ligne sur cet appareil.</Text></View>
            </View>
            <Text style={styles.description}>Tes séances sont enregistrées ici. Exporte une copie de tes entraînements au format JSON pour en conserver une sauvegarde.</Text>
            <Button label={exporting ? 'Export en cours…' : 'Exporter mes entraînements'} icon="download-outline" variant="secondary" disabled={exporting} onPress={saveBackup} />
            {exportError ? <Text style={styles.error} accessibilityRole="alert">{exportError}</Text> : null}
            <Button label="Voir mon historique" icon="time-outline" variant="ghost" onPress={() => router.push('/history')} />
          </Card>

          <Card style={styles.accountCard}>
            <Text style={type.h3}>Accès à ton compte</Text>
            <Text style={styles.description}>Après une déconnexion, ton mot de passe sera nécessaire pour revenir. Tes données restent sur cet appareil.</Text>
            <Button label="Se déconnecter" icon="log-out-outline" variant="danger" onPress={() => confirmDialog('Se déconnecter ?', 'Tes données restent sur cet appareil. Il faudra ton mot de passe pour revenir.', 'Se déconnecter', signOut)} />
          </Card>
        </View>
      </View>

      {__DEV__ && lifetime.sessions === 0 ? (
        <Button label="Charger des données de démo" variant="ghost" icon="flask-outline" onPress={seedDemoData} />
      ) : null}
      <View style={styles.footer}><Text style={styles.footerBrand}>ATLAS</Text><Text style={styles.footerText}>Ta progression commence avec toi.</Text></View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  identityCard: { gap: 24, padding: 24, overflow: 'hidden' },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  name: { color: c.text, fontSize: 25, fontWeight: '700', letterSpacing: -0.8, marginBottom: 4 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  memberDot: { width: 5, height: 5, backgroundColor: c.accent, borderRadius: 3 },
  memberSince: { color: c.textFaint, fontSize: 11, flex: 1 },
  identityBottom: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingTop: 18, borderTopWidth: 1, borderTopColor: c.border },
  identitySignature: { color: c.textFaint, fontSize: 9, letterSpacing: 1.2, fontWeight: '600' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statTile: { flex: 1, minWidth: 136, padding: 20, gap: 14, backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border },
  columns: { gap: 8 },
  columnsWide: { flexDirection: 'row', alignItems: 'flex-start', gap: 24 },
  column: { flex: 1, minWidth: 0, gap: 12 },
  goalCard: { gap: 22, padding: 24 },
  cardHeading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBox: { width: 44, height: 44, borderRadius: 14, backgroundColor: c.accentDim, alignItems: 'center', justifyContent: 'center' },
  description: { ...type.small, lineHeight: 21, marginTop: 3 },
  goalControl: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', gap: 12 },
  goalValueWrap: { alignItems: 'center' },
  goalValue: { ...font.display, color: c.accent, fontSize: 72, lineHeight: 76 },
  goalLabel: { color: c.textDim, fontSize: 12 },
  stepBtn: { borderRadius: radius.pill, backgroundColor: c.surfaceAlt, width: 48, height: 48 },
  presets: { flexDirection: 'row', gap: 8 },
  preset: { flex: 1, minHeight: 44, backgroundColor: c.surfaceAlt, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  presetActive: { backgroundColor: c.accent },
  presetLabel: { color: c.textDim, fontSize: 11, fontWeight: '600' },
  presetLabelActive: { color: c.bg },
  goalHint: { color: c.textFaint, fontSize: 11, lineHeight: 18 },
  social: { gap: 8, padding: 24 },
  socialHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  dataCard: { gap: 14, padding: 24 },
  accountCard: { gap: 12, padding: 24 },
  error: { color: c.danger, fontSize: 12, lineHeight: 18 },
  footer: { alignItems: 'center', gap: 5, paddingVertical: space.xl },
  footerBrand: { color: c.textFaint, fontSize: 12, fontWeight: '800', letterSpacing: 3 },
  footerText: { color: c.textFaint, fontSize: 10 },
});
