import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { c, ff } from '../../lib/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Icône pleine quand l'onglet est actif, contour sinon : l'état se lit sans la couleur. */
const tabIcon =
  (active: IconName, idle: IconName) =>
  ({ color, focused }: { color: ColorValue; focused: boolean }) => (
    <Ionicons name={focused ? active : idle} size={24} color={color as string} />
  );

export default function TabsLayout() {
  // Hauteur explicite : la hauteur par défaut (49 pt) est calibrée pour la police
  // système, Inter avec une icône de 24 n'y tient pas. On rajoute l'encoche du bas.
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.text,
        tabBarInactiveTintColor: c.textFaint,
        tabBarStyle: {
          backgroundColor: c.bg,
          borderTopColor: c.border,
          borderTopWidth: 1,
          height: 62 + insets.bottom,
          paddingTop: 0,
          paddingBottom: insets.bottom,
        },
        // Les labels de la tab bar ne passent pas par components/Text : famille explicite.
        tabBarLabelStyle: { fontSize: 11, lineHeight: 14, fontFamily: ff.semibold },
        sceneStyle: { backgroundColor: c.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Accueil', tabBarIcon: tabIcon('home', 'home-outline') }} />
      <Tabs.Screen
        name="routines"
        options={{ title: 'Séances', tabBarIcon: tabIcon('albums', 'albums-outline') }}
      />
      <Tabs.Screen
        name="exercises"
        options={{ title: 'Exercices', tabBarIcon: tabIcon('barbell', 'barbell-outline') }}
      />
      <Tabs.Screen
        name="history"
        options={{ title: 'Progrès', tabBarIcon: tabIcon('stats-chart', 'stats-chart-outline') }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profil', tabBarIcon: tabIcon('person-circle', 'person-circle-outline') }}
      />
    </Tabs>
  );
}
