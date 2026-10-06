import { StyleSheet, Text, View } from 'react-native';

import { Avatar, Badge, Button, Card, Icon, Screen, SectionTitle, Stat, Title } from '../../components/ui';
import { useQuery } from '../../db/client';
import { getSignedInAccount, signOut } from '../../db/queries/auth';
import { getDashboard, getLifetimeStats } from '../../db/queries/stats';
import { confirmDialog } from '../../lib/confirm';
import { tonnageLabel } from '../../lib/format';
import { c, radius, space } from '../../lib/theme';

export default function ProfileScreen() {
  const account = useQuery(() => getSignedInAccount(), []);
  const lifetime = useQuery(() => getLifetimeStats(), []);
  const dashboard = useQuery(() => getDashboard(), []);

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
          <Text style={styles.name} numberOfLines={1}>
            {account.displayName}
          </Text>
          <Text style={styles.email} numberOfLines={1}>
            {account.email}
          </Text>
          <Text style={styles.since}>Membre depuis {since}</Text>
        </View>
      </View>

      <SectionTitle>Depuis le début</SectionTitle>
      <Card>
        <View style={styles.statRow}>
          <Stat value={String(lifetime.sessions)} label="Séances" />
          <Stat value={tonnageLabel(lifetime.tonnage)} label="Tonnage" />
          <Stat value={String(lifetime.prs)} label="Records" tone={lifetime.prs ? 'accent' : 'default'} />
          <Stat
            value={String(dashboard.streakWeeks)}
            label="Semaines d'affilée"
            tone={dashboard.streakWeeks > 1 ? 'ok' : 'default'}
          />
        </View>
      </Card>

      <SectionTitle right={<Badge label="BIENTÔT" />}>Partenaires</SectionTitle>
      <Card style={styles.social}>
        <View style={styles.socialIcon}>
          <Icon name="people" size={22} color={c.info} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.socialTitle}>Entraîne-toi à plusieurs</Text>
          <Text style={styles.socialBody}>
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },

  identity: { flexDirection: 'row', alignItems: 'center', gap: space.lg, marginVertical: space.sm },
  name: { color: c.text, fontSize: 22, fontWeight: '800' },
  email: { color: c.textDim, fontSize: 14, marginTop: 2 },
  since: { color: c.textFaint, fontSize: 12, marginTop: space.xs },

  statRow: { flexDirection: 'row', gap: space.md },

  social: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  socialIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: c.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  socialTitle: { color: c.text, fontSize: 15, fontWeight: '700' },
  socialBody: { color: c.textDim, fontSize: 14, lineHeight: 20, marginTop: 2 },
});
