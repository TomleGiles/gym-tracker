import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ComponentPropsWithRef, ReactNode } from 'react';
import { useId } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { ColorValue, StyleProp, TextStyle, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { Text, TextInput } from './Text';
import { HIT, c, font, radius, space, type } from '../lib/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Icon({ name, size = 18, color = c.textDim }: { name: IconName; size?: number; color?: ColorValue }) {
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
  const { width } = useWindowDimensions();
  const inner = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.scrollContent, width >= 900 && { padding: 32, paddingBottom: 48 }, style]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, styles.contentWidth, style]}>{children}</View>
  );
  return (
    <SafeAreaView style={styles.screen} edges={edges}>
      {inner}
    </SafeAreaView>
  );
}

export function Title({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[type.title, style]}>{children}</Text>;
}

/** Même hiérarchie sur tous les espaces, avec une action toujours accessible. */
export function PageHeader({ eyebrow, title, subtitle, action }: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.pageHeader}>
      <View style={{ flex: 1, minWidth: 180, gap: 7 }}>
        {eyebrow ? <Text style={[type.overline, { color: c.accent }]}>{eyebrow}</Text> : null}
        <Text accessibilityRole="header" style={type.title}>{title}</Text>
        {subtitle ? <Text style={type.small}>{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={[type.h3, { fontSize: 17 }]}>{children}</Text>
      {right}
    </View>
  );
}

/**
 * Remplit son parent d'un dégradé. En SVG plutôt qu'avec expo-linear-gradient :
 * react-native-svg est déjà là et rend pareil sur le web et en natif.
 */
export function GradientFill({
  colors = c.accentGradient,
  borderRadius = 0,
}: {
  colors?: readonly [string, string];
  borderRadius?: number;
}) {
  const id = useId().replace(/:/g, '');
  return (
    <View style={[StyleSheet.absoluteFill, { borderRadius, overflow: 'hidden' }]} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors[0]} />
            <Stop offset="1" stopColor={colors[1]} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/** Halo diffus d'une couleur, à poser en absolu dans le coin d'une carte. */
export function Glow({ color, size = 320, style }: { color: string; size?: number; style?: StyleProp<ViewStyle> }) {
  const id = useId().replace(/:/g, '');
  return (
    <View style={[{ position: 'absolute', width: size, height: size }, style]} pointerEvents="none">
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={0.32} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={size} height={size} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

export function Card({
  children,
  onPress,
  style,
  outlined = false,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  /** Bordure visible : pour détacher une carte d'une autre carte. */
  outlined?: boolean;
}) {
  const base = [styles.card, outlined && styles.cardOutlined];
  if (!onPress) return <View style={[...base, style]}>{children}</View>;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [...base, style, pressed && styles.pressed]}>
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
  // Désactivé, le bouton principal perd son dégradé : une couleur d'accent
  // passée en transparence devient boueuse.
  const flat = variant === 'primary' && disabled;
  const tint =
    flat ? c.textFaint : variant === 'primary' ? c.onAccent : variant === 'danger' ? c.danger : variant === 'ghost' ? c.textDim : c.text;
  const r = size === 'lg' ? radius.lg : radius.md;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        size === 'lg' && styles.btnLg,
        variant === 'secondary' && styles.btnSecondary,
        variant === 'danger' && styles.btnDanger,
        flat ? styles.btnFlatDisabled : disabled && styles.btnDisabled,
        pressed && styles.btnPressed,
        style,
      ]}
    >
      {variant === 'primary' && !flat ? <GradientFill borderRadius={r} /> : null}
      {icon ? <Icon name={icon} size={size === 'lg' ? 20 : 17} color={tint} /> : null}
      <Text style={[styles.btnLabel, size === 'lg' && styles.btnLabelLg, { color: tint }]}>{label}</Text>
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
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      style={({ pressed }) => pressed && styles.pressed}
    >
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

const STAT_COLOR = { default: c.text, accent: c.accent, ok: c.ok, pr: c.pr } as const;

export function Stat({
  value,
  label,
  tone = 'default',
  size = 'md',
}: {
  value: string;
  label: string;
  tone?: keyof typeof STAT_COLOR;
  size?: 'md' | 'lg';
}) {
  return (
    <View style={styles.stat}>
      <Text
        style={[styles.statValue, size === 'lg' && styles.statValueLg, { color: STAT_COLOR[tone] }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      <Text style={styles.statLabel} numberOfLines={1}>
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
      <View style={styles.emptyIcon}>
        <Icon name={icon} size={28} color={c.textDim} />
      </View>
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

const BADGE_TONE = {
  default: { bg: c.surfaceHigh, fg: c.textDim },
  pr: { bg: c.prDim, fg: c.pr },
  ok: { bg: c.okDim, fg: c.ok },
  accent: { bg: c.accentDim, fg: c.accent },
} as const;

export function Badge({
  label,
  tone = 'default',
  icon,
}: {
  label: string;
  tone?: keyof typeof BADGE_TONE;
  icon?: IconName;
}) {
  const t = BADGE_TONE[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      {icon ? <Icon name={icon} size={11} color={t.fg} /> : null}
      <Text style={[styles.badgeLabel, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

/** Initiales sur pastille : pas de photo tant qu'il n'y a pas de serveur où la stocker. */
export function Avatar({ name, size = 48 }: { name: string; size?: number }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <GradientFill borderRadius={size / 2} />
      <Text style={[styles.avatarLabel, { fontSize: size * 0.38 }]}>{initials(name)}</Text>
    </View>
  );
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?')[0];
  return letters.toUpperCase();
}

/** Anneau de progression, 0 → 1. Le contenu se pose au centre. */
export function ProgressRing({
  progress,
  size = 72,
  stroke = 8,
  color = c.ok,
  track = c.surfaceHigh,
  children,
}: {
  progress: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        {p > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${circumference * p} ${circumference}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
      {children}
    </View>
  );
}

export const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: c.bg },
  contentWidth: { width: '100%', maxWidth: 1320, alignSelf: 'center' },
  scrollContent: { width: '100%', maxWidth: 1320, alignSelf: 'center', padding: 20, paddingBottom: space.xxl * 2, gap: 20 },
  pageHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space.lg, marginBottom: 8 },

  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.md,
  },

  card: {
    backgroundColor: c.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    borderWidth: 1,
    borderColor: c.border,
  },
  cardOutlined: { borderWidth: 1, borderColor: c.border },
  pressed: { opacity: 0.7 },

  btn: {
    minHeight: HIT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  btnLg: { minHeight: 56, borderRadius: radius.lg },
  btnSecondary: { backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.borderStrong },
  btnDanger: { backgroundColor: c.dangerDim },
  btnDisabled: { opacity: 0.4 },
  btnFlatDisabled: { backgroundColor: c.surfaceHigh },
  btnPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
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
    paddingHorizontal: space.md + 2,
    minHeight: HIT,
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: c.surfaceAlt,
  },
  chipActive: { backgroundColor: c.accent },
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
  statValue: { ...font.display, fontSize: 28, lineHeight: 32 },
  statValueLg: { fontSize: 40, lineHeight: 42 },
  statLabel: { color: c.textFaint, fontSize: 12, fontWeight: '500' },

  empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.xl, paddingHorizontal: space.lg },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: c.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  emptyTitle: { color: c.text, fontSize: 17, fontWeight: '700', marginTop: space.sm },
  emptyBody: { color: c.textDim, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  emptyAction: { marginTop: space.md, alignSelf: 'stretch' },

  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md },

  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  badgeLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },

  avatar: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarLabel: { color: c.onAccent, fontWeight: '800' },
});
