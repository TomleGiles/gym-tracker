import { Text as RNText, TextInput as RNTextInput, StyleSheet } from 'react-native';
import type { ComponentPropsWithRef } from 'react';
import type { StyleProp, TextStyle } from 'react-native';

import { ff } from '../lib/theme';

/*
 * Les polices chargées par expo-font sont une famille par graisse
 * (« Inter_700Bold »). Combiner une telle famille avec `fontWeight: '700'`
 * fait synthétiser un faux gras par le navigateur, et Android ignore parfois la
 * famille. On garde donc `fontWeight` dans les styles — c'est plus lisible —
 * et on le traduit ici en famille, poids remis à « normal ».
 */

const BY_WEIGHT: Record<string, string> = {
  '100': ff.regular,
  '200': ff.regular,
  '300': ff.regular,
  '400': ff.regular,
  normal: ff.regular,
  '500': ff.medium,
  '600': ff.semibold,
  '700': ff.bold,
  bold: ff.bold,
  '800': ff.black,
  '900': ff.black,
};

function withFamily(style: StyleProp<TextStyle>): StyleProp<TextStyle> {
  const flat = StyleSheet.flatten(style) ?? {};
  const family = flat.fontFamily ?? BY_WEIGHT[String(flat.fontWeight ?? '400')] ?? ff.regular;
  return [style, { fontFamily: family, fontWeight: 'normal' }];
}

export function Text({ style, ...props }: ComponentPropsWithRef<typeof RNText>) {
  return <RNText {...props} style={withFamily(style)} />;
}

export function TextInput({ style, ...props }: ComponentPropsWithRef<typeof RNTextInput>) {
  return <RNTextInput {...props} style={withFamily(style)} />;
}

/** Pour `useRef<TextInput>` : l'instance reste celle de react-native. */
export type TextInput = RNTextInput;
