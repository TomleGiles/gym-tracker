import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from './Text';
import { Badge, Icon } from './ui';
import { PROGRAMS, installProgram } from '../db/seed/programs';
import { c, font, radius, space, type } from '../lib/theme';

/** Les programmes créent des modèles locaux, ensuite entièrement personnalisables. */
export function ProgramPicker({ onFree }: { onFree?: () => void }) {
  const [wide, setWide] = useState(false);
  const [installed, setInstalled] = useState<string[]>([]);
  const installedIds = useRef(new Set<string>());

  function install(id: string) {
    if (installedIds.current.has(id)) return;
    installedIds.current.add(id);
    try {
      installProgram(id);
      setInstalled((ids) => [...ids, id]);
    } catch (error) {
      installedIds.current.delete(id);
      throw error;
    }
  }

  return (
    <View style={styles.card} onLayout={(event) => setWide(event.nativeEvent.layout.width > 780)}>
      <View style={styles.heading}>
        <View style={styles.headingText}>
          <Badge label="LES ESSENTIELS TRAKR" tone="accent" icon="sparkles" />
          <Text style={[type.h2, { marginTop: space.md }]}>Un bon départ. Un vrai plan.</Text>
          <Text style={[type.small, { marginTop: 6 }]}>Choisis ton rythme. On prépare les séances, tu écris la suite.</Text>
        </View>
        <View style={styles.headingIcon}><Icon name="layers-outline" size={26} color={c.accent} /></View>
      </View>
      <View style={[styles.programs, wide && styles.programsWide]}>
        {PROGRAMS.map((p, index) => {
          const isInstalled = installed.includes(p.id);
          return (
            <Pressable
              key={p.id}
              onPress={() => install(p.id)}
              disabled={isInstalled}
              accessibilityRole="button"
              accessibilityState={{ disabled: isInstalled }}
              accessibilityLabel={isInstalled ? `${p.name} ajouté à tes séances` : `Ajouter le programme ${p.name}, ${p.daysPerWeek} jours par semaine`}
              style={({ pressed }) => [styles.program, wide && styles.programWide, isInstalled && styles.installed, pressed && { opacity: 0.7 }]}
            >
              <View style={styles.programTop}>
                <Text style={styles.index}>{String(index + 1).padStart(2, '0')}</Text>
                <Badge label={`${p.daysPerWeek} JOURS / SEM.`} />
              </View>
              <Text style={styles.name}>{p.name}</Text>
              <Text style={styles.tagline}>{p.tagline}</Text>
              <View style={styles.routines}>
                {p.routines.map((r) => (
                  <View key={r.name} style={styles.routine}>
                    <View style={[styles.dot, { backgroundColor: r.color }]} />
                    <Text style={styles.routineText}>{r.name}</Text>
                    <Text style={styles.routineCount}>{r.items.length} ex.</Text>
                  </View>
                ))}
              </View>
              <View style={styles.action}>
                <Text style={styles.actionLabel}>{isInstalled ? 'Ajouté à tes séances' : 'Choisir ce programme'}</Text>
                <Icon name={isInstalled ? 'checkmark-circle' : 'arrow-forward'} size={19} color={c.accent} />
              </View>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.note}>Exercices, séries et temps de repos inclus. Tout reste modifiable.</Text>
      {onFree ? (
        <Pressable onPress={onFree} accessibilityRole="button" hitSlop={8} style={styles.free}>
          <Icon name="add" size={16} color={c.textDim} />
          <Text style={styles.freeText}>Ou démarrer une séance libre</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: c.surface, borderRadius: radius.xl, padding: space.xl, borderWidth: 1, borderColor: c.border },
  heading: { flexDirection: 'row', gap: 16, justifyContent: 'space-between' },
  headingText: { flex: 1, alignItems: 'flex-start' },
  headingIcon: { width: 50, height: 50, borderRadius: 16, backgroundColor: c.accentDim, alignItems: 'center', justifyContent: 'center' },
  programs: { gap: space.md, marginTop: space.xl },
  programsWide: { flexDirection: 'row', alignItems: 'stretch' },
  program: { backgroundColor: c.bg, borderWidth: 1, borderColor: c.border, borderRadius: radius.lg, padding: 20 },
  programWide: { flex: 1, minWidth: 0 },
  installed: { borderColor: c.accent },
  programTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  index: { ...font.tabular, fontSize: 13, color: c.textFaint },
  name: { ...font.display, color: c.text, fontSize: 30, lineHeight: 33 },
  tagline: { ...type.small, marginTop: 6, minHeight: 38 },
  routines: { gap: 10, marginTop: 20, marginBottom: 20, flex: 1 },
  routine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  routineText: { color: c.textDim, fontSize: 12, flex: 1 },
  routineCount: { color: c.textFaint, fontSize: 11 },
  action: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 12, gap: 8 },
  actionLabel: { color: c.accent, fontSize: 12, fontWeight: '700', flex: 1 },
  note: { ...type.caption, textAlign: 'center', marginTop: 20, lineHeight: 18 },
  free: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, alignSelf: 'center', marginTop: space.sm },
  freeText: { color: c.textDim, fontSize: 13, fontWeight: '600' },
});
