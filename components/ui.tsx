import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ComponentPropsWithRef, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HIT, c, font, radius, space } from '../lib/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Icon({ name, size = 18, color = c.textDim }: { name: IconName; size?: number; color?: string }) {
  return <Ionicons name={name} size={size} color={color} />;
}

export function Screen({
  children,
  scroll = false,
  edges = ['top'],
  style,
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: ('top' | 'bottom')[];
  style?: StyleProp<ViewStyle>;
}) {
  const inner = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.scrollContent, style]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, style]}>{children}</View>
  );
  return (
    <SafeAreaView style={styles.screen} edges={edges}>
      {inner}
    </SafeAreaView>
  );
}

export function Title({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.title, style]}>{children}</Text>;
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {right}
    </View>
  );
}

export function Card({
  children,
  onPress,
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  if (!onPress) return <View style={[styles.card, style]}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}
    >
      {children}
    </Pressable>
  );
}

export type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: IconName;
  disabled?: boolean;
  size?: 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  size = 'md',
  style,
}: ButtonProps) {
  const tint =
    variant === 'primary' ? c.bg : variant === 'danger' ? '#FF7A63' : variant === 'ghost' ? c.textDim : c.text;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        size === 'lg' && styles.btnLg,
        variant === 'primary' && styles.btnPrimary,
        variant === 'secondary' && styles.btnSecondary,
        variant === 'ghost' && styles.btnGhost,
        variant === 'danger' && styles.btnDanger,
        disabled && styles.btnDisabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={size === 'lg' ? 20 : 17} color={tint} /> : null}
      <Text style={[styles.btnLabel, size === 'lg' && styles.btnLabelLg, { color: tint }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function IconButton({
  name,
  onPress,
  color = c.textDim,
  size = 20,
  accessibilityLabel,
  disabled,
  style,
}: {
  name: IconName;
  onPress: () => void;
  color?: string;
  size?: number;
  accessibilityLabel: string;
  disabled?: boolean;
  /** Pour resserrer un bouton empilé ; le hitSlop garde la cible tactile. */
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.iconBtn,
        style,
        pressed && styles.pressed,
        disabled && styles.btnDisabled,
      ]}
    >
      <Icon name={name} size={size} color={color} />
    </Pressable>
  );
}

export function Chip({
  label,
  active,
  onPress,
  tint,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  tint?: string;
}) {
  const body = (
    <View style={[styles.chip, active && styles.chipActive, tint && active ? { backgroundColor: tint } : null]}>
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{label}</Text>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      {body}
    </Pressable>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

export function Input(props: ComponentPropsWithRef<typeof TextInput>) {
  return (
    <TextInput
      placeholderTextColor={c.textFaint}
      {...props}
      style={[styles.input, props.style]}
    />
  );
}

export function Stat({
  value,
  label,
  tone = 'default',
}: {
  value: string;
  label: string;
  tone?: 'default' | 'accent' | 'ok';
}) {
  const color = tone === 'accent' ? c.accent : tone === 'ok' ? c.ok : c.text;
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, font.tabular, { color }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.statLabel} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: IconName;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <Icon name={icon} size={38} color={c.textFaint} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
      {action ? <View style={styles.emptyAction}>{action}</View> : null}
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={c.accent} />
      {label ? <Text style={styles.emptyBody}>{label}</Text> : null}
    </View>
  );
}

export function Badge({ label, tone = 'default' }: { label: string; tone?: 'default' | 'pr' | 'ok' }) {
  return (
    <View
      style={[
        styles.badge,
        tone === 'pr' && { backgroundColor: c.accentDim },
        tone === 'ok' && { backgroundColor: c.okDim },
      ]}
    >
      <Text
        style={[
          styles.badgeLabel,
          tone === 'pr' && { color: c.accent },
          tone === 'ok' && { color: c.ok },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

/** Initiales sur pastille : pas de photo tant qu'il n'y a pas de serveur où la stocker. */
export function Avatar({ name, size = 48 }: { name: string; size?: number }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarLabel, { fontSize: size * 0.38 }]}>{initials(name)}</Text>
    </View>
  );
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
}

export const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: c.bg },
  scrollContent: { padding: space.lg, paddingBottom: space.xxl * 2, gap: space.md },

  title: { color: c.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.sm,
  },
  sectionTitle: {
    color: c.textDim,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  card: {
    backgroundColor: c.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: c.border,
    padding: space.lg,
  },
  pressed: { opacity: 0.65 },

  btn: {
    minHeight: HIT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
  },
  btnLg: { minHeight: 56, borderRadius: radius.lg },
  btnPrimary: { backgroundColor: c.accent },
  btnSecondary: { backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border },
  btnGhost: { backgroundColor: 'transparent' },
  btnDanger: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#5A2418' },
  btnDisabled: { opacity: 0.4 },
  btnLabel: { fontSize: 15, fontWeight: '700' },
  btnLabelLg: { fontSize: 17 },

  iconBtn: {
    width: HIT,
    height: HIT,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },

  chip: {
    paddingHorizontal: space.md,
    height: 34,
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: c.surfaceAlt,
    borderWidth: 1,
    borderColor: c.border,
  },
  chipActive: { backgroundColor: c.accent, borderColor: c.accent },
  chipLabel: { color: c.textDim, fontSize: 13, fontWeight: '600' },
  chipLabelActive: { color: c.bg },

  field: { gap: space.sm },
  fieldLabel: { color: c.textDim, fontSize: 13, fontWeight: '600' },
  fieldHint: { color: c.textFaint, fontSize: 12 },
  input: {
    minHeight: HIT,
    backgroundColor: c.surfaceAlt,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    color: c.text,
    fontSize: 16,
  },

  stat: { flex: 1, gap: 2 },
  statValue: { fontSize: 20, fontWeight: '800' },
  statLabel: { color: c.textFaint, fontSize: 11, fontWeight: '600' },

  empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.xxl, paddingHorizontal: space.lg },
  emptyTitle: { color: c.text, fontSize: 17, fontWeight: '700', marginTop: space.sm },
  emptyBody: { color: c.textDim, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  emptyAction: { marginTop: space.md, alignSelf: 'stretch' },

  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md },

  badge: {
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
    backgroundColor: c.surfaceAlt,
  },
  badgeLabel: { color: c.textDim, fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },

  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.accentDim,
    borderWidth: 1.5,
    borderColor: c.accent,
  },
  avatarLabel: { color: c.text, fontWeight: '800' },
});
