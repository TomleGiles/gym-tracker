import { StyleSheet, View } from 'react-native';

import { Text } from '../../components/Text';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Icon,
  IconButton,
  Screen,
  SectionTitle,
  Stat,
  Title,
} from '../../components/ui';
import { useQuery } from '../../db/client';
import { getSignedInAccount, signOut } from '../../db/queries/auth';
import { WEEKLY_GOAL_RANGE, getWeeklyGoal, setWeeklyGoal } from '../../db/queries/engagement';
import { getDashboard, getLifetimeStats } from '../../db/queries/stats';
import { seedDemoData } from '../../db/seed/demo';
import { confirmDialog } from '../../lib/confirm';
import { tonnageLabel } from '../../lib/format';
import { c, font, radius, space, type } from '../../lib/theme';

export default function ProfileScreen() {
  const account = useQuery(() => getSignedInAccount(), []);
  const lifetime = useQuery(() => getLifetimeStats(), []);
  const dashboard = useQuery(() => getDashboard(), []);
  const goal = useQuery(() => getWeeklyGoal(), []);

  // Le garde de app/_layout.tsx démonte cet écran dès la déconnexion.
  if (!account) return null;

  const since = new Date(account.createdAt).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <Screen scroll>
      <Title>Profil</Title>

      <View style={styles.identity}>
        <Avatar name={account.displayName} size={72} />
        <View style={styles.flex}>
          <Text style={type.h2} numberOfLines={1}>
            {account.displayName}
          </Text>
          <Text style={type.small} numberOfLines={1}>
            {account.email}
          </Text>
          <Text style={[type.caption, { marginTop: space.xs }]}>Membre depuis {since}</Text>
        </View>
      </View>

      <Card>
        <View style={styles.statRow}>
          <Stat value={String(lifetime.sessions)} label="Séances" />
          <Stat value={tonnageLabel(lifetime.tonnage)} label="Soulevés" />
          <Stat value={String(lifetime.prs)} label="Records" tone={lifetime.prs ? 'pr' : 'default'} />
          <Stat
            value={`${dashboard.streakWeeks} sem.`}
            label="Régularité"
            tone={dashboard.streakWeeks > 1 ? 'ok' : 'default'}
          />
        </View>
      </Card>

      <SectionTitle>Objectif</SectionTitle>
      <Card style={styles.goal}>
        <View style={styles.flex}>
          <Text style={type.h3}>Séances par semaine</Text>
          <Text style={type.caption}>Ce que l'anneau de l'accueil te demande.</Text>
        </View>
        <View style={styles.stepper}>
          <IconButton
            name="remove"
            accessibilityLabel="Une séance de moins"
            color={c.text}
            disabled={goal <= WEEKLY_GOAL_RANGE.min}
            onPress={() => setWeeklyGoal(goal - 1)}
            style={styles.stepBtn}
          />
          <Text style={styles.stepValue}>{goal}</Text>
          <IconButton
            name="add"
            accessibilityLabel="Une séance de plus"
            color={c.text}
            disabled={goal >= WEEKLY_GOAL_RANGE.max}
            onPress={() => setWeeklyGoal(goal + 1)}
            style={styles.stepBtn}
          />
        </View>
      </Card>

      <SectionTitle right={<Badge label="Bientôt" tone="accent" />}>Partenaires</SectionTitle>
      <Card style={styles.social}>
        <View style={styles.socialIcon}>
          <Icon name="people" size={22} color={c.info} />
        </View>
        <View style={styles.flex}>
          <Text style={type.h3}>Entraîne-toi à plusieurs</Text>
          <Text style={[type.small, { marginTop: 2 }]}>
            Partage tes séances avec ceux qui viennent avec toi à la salle et suis leur
            progression. Arrive avec la synchronisation.
          </Text>
        </View>
      </Card>

      <SectionTitle>Compte</SectionTitle>
      <Button
        label="Se déconnecter"
        icon="log-out-outline"
        variant="danger"
        onPress={() =>
          confirmDialog(
            'Se déconnecter ?',
            'Tes données restent sur ce téléphone. Il faudra ton mot de passe pour revenir.',
            'Se déconnecter',
            signOut,
          )
        }
      />

      {__DEV__ && lifetime.sessions === 0 ? (
        <Button label="Charger des données de démo" variant="ghost" icon="flask-outline" onPress={seedDemoData} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },

  identity: { flexDirection: 'row', alignItems: 'center', gap: space.lg, marginVertical: space.sm },

  statRow: { flexDirection: 'row', gap: space.md },

  goal: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.surfaceAlt,
    borderRadius: radius.pill,
  },
  stepBtn: { borderRadius: radius.pill },
  stepValue: { ...font.display, color: c.text, fontSize: 26, minWidth: 28, textAlign: 'center' },

  social: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  socialIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: c.infoDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
