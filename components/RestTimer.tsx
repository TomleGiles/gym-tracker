import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { Text } from './Text';
import { mmss } from '../lib/format';
import { c, font, radius, space } from '../lib/theme';
import { useActiveSession } from '../stores/activeSession';
import { Icon } from './ui';

const SIZE = 44;
const STROKE = 4;
const R = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * R;

/**
 * Barre de chrono de repos, ancrée en bas de l'écran de séance.
 *
 * Le compte à rebours est dérivé d'une échéance absolue (`endsAt`) : si le JS
 * a été gelé pendant que l'écran était éteint, l'affichage est juste dès le
 * retour au premier plan, sans resynchronisation.
 */
export function RestTimer() {
  const rest = useActiveSession((s) => s.rest);
  const stopRest = useActiveSession((s) => s.stopRest);
  const extendRest = useActiveSession((s) => s.extendRest);

  const [remaining, setRemaining] = useState(0);
  const buzzed = useRef(false);

  useEffect(() => {
    if (!rest) return;
    buzzed.current = false;

    const tick = () => setRemaining(Math.max(0, (rest.endsAt - Date.now()) / 1000));
    tick();
    const handle = setInterval(tick, 250);
    return () => clearInterval(handle);
  }, [rest]);

  useEffect(() => {
    if (!rest || rest.endsAt > Date.now() || remaining > 0 || buzzed.current) return;
    buzzed.current = true;
    if (Platform.OS !== 'web') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [remaining, rest]);

  if (!rest) return (
    <View style={styles.idle}>
      <Icon name="timer-outline" size={19} color={c.textFaint} />
      <Text style={styles.idleText}>Valide une série pour lancer ton repos.</Text>
      <View style={styles.autoBadge}><Text style={styles.autoLabel}>AUTO</Text></View>
    </View>
  );

  const done = remaining <= 0;
  const progress = done ? 1 : Math.max(0, Math.min(1, 1 - remaining / rest.totalSeconds));

  return (
    <View style={[styles.bar, done && styles.barDone]}>
      <Svg width={SIZE} height={SIZE}>
        <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={c.border} strokeWidth={STROKE} fill="none" />
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          stroke={done ? c.ok : c.accent}
          strokeWidth={STROKE}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${CIRC} ${CIRC}`}
          strokeDashoffset={CIRC * (1 - progress)}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </Svg>

      <View style={styles.text}>
        <Text style={[styles.time, font.tabular, done && { color: c.ok }]}>
          {done ? 'À toi de jouer' : mmss(remaining)}
        </Text>
        <Text style={styles.label} numberOfLines={1}>
          {rest.exerciseLabel}
        </Text>
      </View>

      {!done ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Ajouter 30 secondes de repos" onPress={() => extendRest(30)} hitSlop={8} style={styles.add}>
          <Text style={styles.addLabel}>+30 s</Text>
        </Pressable>
      ) : null}

      <Pressable accessibilityRole="button" onPress={stopRest} hitSlop={8} style={styles.close} accessibilityLabel={done ? 'Fermer le chrono' : 'Passer le repos'}>
        <Icon name={done ? 'checkmark' : 'play-skip-forward'} size={20} color={c.textDim} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  idle: { minHeight: 58, flexDirection: 'row', gap: space.sm, alignItems: 'center', paddingHorizontal: space.lg, borderRadius: radius.lg, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
  idleText: { color: c.textFaint, flex: 1, fontSize: 11 },
  autoBadge: { borderRadius: radius.sm, backgroundColor: c.surfaceHigh, paddingHorizontal: 6, paddingVertical: 4 },
  autoLabel: { color: c.textDim, fontSize: 10, letterSpacing: 1, fontWeight: '700' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.accent,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  barDone: { borderColor: c.ok },
  text: { flex: 1 },
  time: { color: c.accent, fontSize: 28, ...font.display },
  label: { color: c.textFaint, fontSize: 12 },
  add: {
    paddingHorizontal: space.md,
    height: 44,
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: c.surfaceAlt,
  },
  addLabel: { color: c.text, fontSize: 13, fontWeight: '700' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
