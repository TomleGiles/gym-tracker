import { useId } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { Text } from './Text';
import { c, font } from '../lib/theme';

export function Brand({ compact = false, size = 'sm' }: { compact?: boolean; size?: 'sm' | 'lg' }) {
  const big = size === 'lg';
  return <View style={styles.brand} accessibilityLabel="Trakr, chaque série compte">
    {/* Le logo est une courbe de progression qui monte, et son dernier point est la séance du jour. */}
    <Svg width={big ? 44 : 32} height={big ? 44 : 32} viewBox="0 0 40 40">
      <Path d="M5 31 14 21l7 5 11-13" fill="none" stroke={c.accent} strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="32" cy="13" r="8" fill="none" stroke={c.accent} strokeOpacity={0.35} strokeWidth={2} />
      <Circle cx="32" cy="13" r="4.5" fill={c.accent} />
    </Svg>
    {!compact ? <Text style={[styles.wordmark, big && { fontSize: 38, letterSpacing: 5 }]}>TRAK<Text style={styles.wordmarkAccent}>R</Text></Text> : null}
  </View>;
}

/**
 * Masque l'illustration aux lecteurs d'écran. Les props natives
 * (accessibilityElementsHidden…) finiraient telles quelles sur le <svg> DOM,
 * que React rejette : le web a son propre attribut.
 */
const decorative: object = Platform.OS === 'web'
  ? { 'aria-hidden': true }
  : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' };

/** Illustration vectorielle locale, disponible hors ligne. */
export function TrainingArtwork({ color = c.accent }: { color?: string }) {
  const id = useId().replace(/:/g, '');
  return <Svg width="100%" height="100%" viewBox="0 0 460 350" {...decorative}>
    <Defs>
      <LinearGradient id={`${id}metal`} x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#6E6C68" /><Stop offset="0.45" stopColor="#292826" /><Stop offset="1" stopColor="#121211" /></LinearGradient>
      <LinearGradient id={`${id}accent`} x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#FFFBF3" /><Stop offset="0.5" stopColor={color} /><Stop offset="1" stopColor="#9C927F" /></LinearGradient>
    </Defs>
    <Circle cx="249" cy="172" r="140" fill="none" stroke={color} strokeOpacity="0.09" />
    <Circle cx="249" cy="172" r="111" fill="none" stroke={color} strokeOpacity="0.11" strokeDasharray="3 8" />
    <Circle cx="249" cy="172" r="79" fill={color} fillOpacity="0.025" />
    <Line x1="52" y1="172" x2="445" y2="172" stroke={color} strokeOpacity="0.08" />
    <Line x1="249" y1="13" x2="249" y2="333" stroke={color} strokeOpacity="0.08" />
    <Ellipse cx="257" cy="291" rx="143" ry="18" fill="#000" fillOpacity="0.22" />
    <G transform="rotate(-32 245 170)">
      <Rect x="135" y="155" width="220" height="31" rx="9" fill={`url(#${id}metal)`} stroke="#7C7974" />
      {Array.from({ length: 12 }, (_, i) => <Line key={i} x1={210 + i * 6} y1="159" x2={202 + i * 6} y2="182" stroke="#ABA79F" strokeOpacity="0.35" />)}
      <Rect x="127" y="96" width="46" height="146" rx="17" fill={`url(#${id}metal)`} stroke="#64615C" />
      <Rect x="154" y="90" width="30" height="158" rx="11" fill={`url(#${id}accent)`} />
      <Rect x="110" y="119" width="25" height="100" rx="9" fill={`url(#${id}metal)`} stroke="#64615C" />
      <Rect x="316" y="96" width="46" height="146" rx="17" fill={`url(#${id}metal)`} stroke="#64615C" />
      <Rect x="301" y="90" width="30" height="158" rx="11" fill={`url(#${id}accent)`} />
      <Rect x="359" y="119" width="25" height="100" rx="9" fill={`url(#${id}metal)`} stroke="#64615C" />
      <Line x1="164" y1="107" x2="164" y2="230" stroke="#FFF9EE" strokeOpacity="0.6" strokeWidth="2" />
      <Line x1="311" y1="107" x2="311" y2="230" stroke="#FFF9EE" strokeOpacity="0.6" strokeWidth="2" />
    </G>
    <Circle cx="101" cy="73" r="4" fill={color} /><Path d="M365 268h15m-7.5-7.5v15" stroke={color} strokeOpacity="0.65" strokeWidth="2" /><Path d="M60 244h25m-12.5-12.5v25" stroke={color} strokeOpacity="0.3" />
  </Svg>;
}

const styles = StyleSheet.create({
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wordmark: { ...font.display, fontSize: 29, letterSpacing: 3.5, color: c.text },
  // `Text` impose Inter par défaut, même imbriqué : on répète la police display.
  wordmarkAccent: { ...font.display, color: c.accent },
});
