import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Loading } from '../components/ui';
import { db, initDatabase, useQuery } from '../db/client';
import { getSignedInAccount } from '../db/queries/auth';
import migrations from '../db/migrations/migrations';
import { runSeed } from '../db/seed';
import { configureNotifications } from '../lib/notifications';
import { c, space } from '../lib/theme';

export default function RootLayout() {
  const [opened, setOpened] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    configureNotifications();
    initDatabase().then(
      () => setOpened(true),
      (e) => {
        console.error('[muscu] ouverture de la base impossible', e);
        setError(e);
      },
    );
  }, []);

  if (error) return <Fatal error={error} />;
  if (!opened) return <Booting label="Ouverture de la base…" />;

  // `useMigrations` attaque la base dès son premier rendu : ce sous-arbre ne
  // doit donc être monté qu'une fois la connexion réellement ouverte.
  return <MigratedApp />;
}

function MigratedApp() {
  const { success, error } = useMigrations(db, migrations);
  const [seedError, setSeedError] = useState<unknown>(null);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (!success || seeded) return;
    try {
      runSeed();
      setSeeded(true);
    } catch (e) {
      setSeedError(e);
    }
  }, [success, seeded]);

  const fatal = error ?? seedError;
  if (fatal) return <Fatal error={fatal} />;
  if (!success) return <Booting label="Migration du schéma…" />;
  if (!seeded) return <Booting label="Chargement des exercices…" />;

  return <AppNavigator />;
}

/** Monté seulement une fois la base migrée : la lecture du compte en dépend. */
function AppNavigator() {
  const account = useQuery(() => getSignedInAccount(), []);
  const signedIn = account !== null;

  return (
    <GestureHandlerRootView style={styles.fill}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: c.bg },
            headerTintColor: c.text,
            // Le header de react-native-screens écarte les mots sur le web
            // (« Push   1 »). On rend le titre nous-mêmes : même résultat partout.
            headerTitle: ({ children }) => (
              <Text style={styles.headerTitle} numberOfLines={1}>
                {children}
              </Text>
            ),
            headerShadowVisible: false,
            contentStyle: { backgroundColor: c.bg },
          }}
        >
          {/* Changer de garde suffit : expo-router redirige vers le premier écran autorisé. */}
          <Stack.Protected guard={!signedIn}>
            <Stack.Screen name="login" options={{ headerShown: false, animation: 'fade' }} />
          </Stack.Protected>
          <Stack.Protected guard={signedIn}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false, animation: 'fade' }} />
            {/* Le mode séance est plein écran, hors tabs (§5). */}
            <Stack.Screen
              name="session/[id]"
              options={{ headerShown: false, gestureEnabled: false, animation: 'fade' }}
            />
            <Stack.Screen name="exercises/[id]" options={{ title: '' }} />
            <Stack.Screen name="routines/new" options={{ title: 'Nouvelle séance', presentation: 'modal' }} />
            <Stack.Screen name="routines/[id]" options={{ title: 'Séance' }} />
            <Stack.Screen name="history/[id]" options={{ title: 'Séance' }} />
            <Stack.Screen name="history/volume" options={{ title: 'Volume par muscle' }} />
          </Stack.Protected>
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const Booting = ({ label }: { label: string }) => (
  <View style={styles.boot}>
    <Loading label={label} />
  </View>
);

const Fatal = ({ error }: { error: unknown }) => (
  <View style={styles.fatal}>
    <Text style={styles.fatalTitle}>La base locale n'a pas pu démarrer</Text>
    <Text style={styles.fatalBody} selectable>
      {describe(error)}
    </Text>
  </View>
);

/** Le portage web d'expo-sqlite rejette parfois avec un objet nu, pas une Error. */
function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  headerTitle: { color: c.text, fontSize: 17, fontWeight: '700' },
  boot: { flex: 1, backgroundColor: c.bg },
  fatal: { flex: 1, backgroundColor: c.bg, padding: space.xl, justifyContent: 'center' },
  fatalTitle: { color: c.accent, fontSize: 17, fontWeight: '700', marginBottom: space.md },
  fatalBody: { color: c.textDim, fontSize: 14, lineHeight: 20 },
});
