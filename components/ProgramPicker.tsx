import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from './Text';
import { Badge, Icon } from './ui';
import { PROGRAMS, installProgram } from '../db/seed/programs';
import { c, radius, space, type } from '../lib/theme';

/**
 * Premier pas d'un nouvel utilisateur : un programme complet en un appui,
 * plutôt qu'un écran vide qui demande de tout construire avant de s'entraîner.
 */
export function ProgramPicker({ onFree }: { onFree?: () => void }) {
  return (
    <View style={styles.card}>
      <Badge label="Pour commencer" tone="accent" icon="sparkles" />
      <Text style={[type.h2, { marginTop: space.md }]}>Choisis ton programme</Text>
      <Text style={[type.small, { marginTop: 2 }]}>
        Un appui crée tes séances. Tu pourras tout modifier ensuite.
      </Text>
      <View style={styles.programs}>
        {PROGRAMS.map((p) => (
          <Pressable
            key={p.id}
            onPress={() => installProgram(p.id)}
            accessibilityRole="button"
            accessibilityLabel={`Installer le programme ${p.name}`}
            style={({ pressed }) => [styles.program, pressed && { opacity: 0.7 }]}
          >
            <View style={styles.dots}>
              {p.routines.map((r) => (
                <View key={r.name} style={[styles.dot, { backgroundColor: r.color }]} />
              ))}
            </View>
            <View style={styles.flex}>
              <Text style={type.h3}>{p.name}</Text>
              <Text style={type.caption}>
                {p.tagline} · {p.daysPerWeek} j/sem.
              </Text>
            </View>
            <Icon name="add-circle" size={26} color={c.accent} />
          </Pressable>
        ))}
      </View>
      {onFree ? (
        <Pressable onPress={onFree} hitSlop={8} style={styles.free}>
          <Icon name="add" size={16} color={c.textDim} />
          <Text style={styles.freeText}>Ou démarrer une séance libre</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    backgroundColor: c.surface,
    borderRadius: radius.xl,
    padding: space.xl,
    borderWidth: 1,
    borderColor: c.border,
  },
  programs: { gap: space.sm, marginTop: space.lg },
  program: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: c.surfaceAlt,
    borderRadius: radius.lg,
    padding: space.md,
    minHeight: 64,
  },
  dots: { width: 28, flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  free: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32, alignSelf: 'center', marginTop: space.md },
  freeText: { color: c.textDim, fontSize: 14, fontWeight: '600' },
});
