import { Tabs, usePathname, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Brand } from '../../components/Brand';
import { Text } from '../../components/Text';
import { Avatar, Icon } from '../../components/ui';
import type { IconName } from '../../components/ui';
import { useQuery } from '../../db/client';
import { getSignedInAccount } from '../../db/queries/auth';
import { getActiveSession } from '../../db/queries/sessions';
import { c, ff, radius, type } from '../../lib/theme';

const routes = [
  { name: 'index', path: '/' as const, title: 'Vue d’ensemble', short: 'Accueil', icon: 'grid-outline' as IconName },
  { name: 'routines', path: '/routines' as const, title: 'Mes séances', short: 'Séances', icon: 'barbell-outline' as IconName },
  { name: 'exercises', path: '/exercises' as const, title: 'Bibliothèque', short: 'Exercices', icon: 'layers-outline' as IconName },
  { name: 'history', path: '/history' as const, title: 'Ma progression', short: 'Progrès', icon: 'stats-chart-outline' as IconName },
  { name: 'profile', path: '/profile' as const, title: 'Mon espace', short: 'Profil', icon: 'person-outline' as IconName },
];

export default function TabsLayout() {
  const desktop = useWindowDimensions().width >= 1000;
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();
  const account = useQuery(() => getSignedInAccount(), []);
  const active = useQuery(() => getActiveSession(), []);
  return <View style={s.shell}>
    {desktop ? <View style={s.sidebar}>
      <View style={s.brand}><Brand /></View>
      <Text style={s.navLabel}>TON ESPACE D’ENTRAÎNEMENT</Text>
      <View style={s.nav}>{routes.map((route) => {
        const selected = pathname === route.path;
        return <Pressable key={route.name} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => router.navigate(route.path)} style={({ pressed }) => [s.navItem, selected && s.navActive, pressed && { opacity: 0.7 }]}>
          <Icon name={route.icon} size={20} color={selected ? c.accent : c.textDim} /><Text style={[s.navText, selected && { color: c.accent }]}>{route.title}</Text>{selected ? <View style={s.navDot} /> : null}
        </Pressable>;
      })}</View>
      <View style={{ flex: 1 }} />
      {active ? <Pressable accessibilityRole="button" onPress={() => router.push(`/session/${active.id}`)} style={s.live}>
        <Icon name="play-circle" color={c.accent} size={25} /><View style={{ flex: 1, gap: 3 }}><Text style={s.liveLabel}>Reprendre la séance</Text><Text numberOfLines={1} style={type.caption}>{active.routineName}</Text></View>
      </Pressable> : <View style={s.motto}><Icon name="flash-outline" color={c.accent} size={23} /><Text style={s.mottoTitle}>Chaque séance{'\n'}compte.</Text><Text style={type.caption}>Le progrès se construit ici.</Text></View>}
      <View style={s.local}><View style={s.localDot} /><Text style={s.localText}>Prêt, même hors ligne</Text></View>
      {account ? <Pressable accessibilityRole="button" accessibilityLabel="Ouvrir mon profil" onPress={() => router.navigate('/profile')} style={s.account}>
        <Avatar name={account.displayName} size={36} /><View style={{ flex: 1, gap: 3 }}><Text numberOfLines={1} style={s.accountName}>{account.displayName}</Text><Text style={type.caption}>Mon espace personnel</Text></View><Icon name="chevron-forward" size={15} />
      </Pressable> : null}
    </View> : null}
    <View style={s.main}>
      {desktop ? <View style={s.topbar}><Text style={s.topLabel}>ENTRAÎNE-TOI. MESURE. PROGRESSE.</Text><View style={s.topRight}><Icon name="calendar-outline" size={15} /><Text style={type.caption}>{new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</Text><View style={s.topDivider} /><Icon name="shield-checkmark-outline" size={15} color={c.accent} /><Text style={type.caption}>Données sur cet appareil</Text></View></View> : null}
      <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: c.accent, tabBarInactiveTintColor: c.textFaint,
        tabBarStyle: desktop ? { display: 'none' } : { backgroundColor: c.surface, borderTopColor: c.border, height: 68 + insets.bottom, paddingTop: 7, paddingBottom: Math.max(8, insets.bottom) },
        tabBarLabelStyle: { fontSize: 10, lineHeight: 15, fontFamily: ff.semibold }, sceneStyle: { backgroundColor: c.bg } }}>
        {routes.map((route) => <Tabs.Screen key={route.name} name={route.name} options={{ title: route.short, tabBarIcon: ({ color, focused }) => <View style={[s.mobileIcon, focused && { backgroundColor: c.accentDim }]}><Icon name={route.icon} size={21} color={color} /></View> }} />)}
      </Tabs>
    </View>
  </View>;
}

const s = StyleSheet.create({
  shell: { flex: 1, flexDirection: 'row', backgroundColor: c.bg },
  sidebar: { width: 224, padding: 16, borderRightWidth: 1, borderRightColor: c.border, backgroundColor: '#101418' },
  brand: { paddingHorizontal: 12, paddingVertical: 20, marginBottom: 30 },
  navLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 1, color: c.textFaint, paddingLeft: 12, marginBottom: 14 },
  nav: { gap: 7 },
  navItem: { minHeight: 49, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, gap: 11, borderRadius: radius.md },
  navActive: { backgroundColor: c.accentDim },
  navText: { color: c.textDim, fontSize: 13, fontWeight: '600', flex: 1 },
  navDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: c.accent },
  main: { flex: 1, minWidth: 0 },
  topbar: { minHeight: 65, borderBottomWidth: 1, borderBottomColor: c.border, paddingHorizontal: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 20 },
  topLabel: { color: c.textFaint, fontSize: 10, letterSpacing: 1.6, fontWeight: '600' },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topDivider: { height: 16, width: 1, backgroundColor: c.border, marginHorizontal: 10 },
  mobileIcon: { width: 44, height: 29, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  motto: { borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: 17, gap: 14, marginTop: 24 },
  mottoTitle: { color: c.text, fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.7 },
  local: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 22, justifyContent: 'center' },
  localDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: c.ok },
  localText: { fontSize: 10, color: c.textFaint },
  account: { borderTopWidth: 1, borderTopColor: c.border, paddingTop: 18, flexDirection: 'row', alignItems: 'center', gap: 9 },
  accountName: { color: c.text, fontSize: 12, fontWeight: '600' },
  live: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.accentDim, padding: 12, borderRadius: radius.md },
  liveLabel: { color: c.accent, fontSize: 11, fontWeight: '700' },
});
