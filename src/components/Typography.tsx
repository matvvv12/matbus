import React from 'react';
import { StyleSheet, Text as RNText, TextInput as RNTextInput, TextProps, TextInputProps } from 'react-native';

// Шрифт Manrope (геометрический, поддерживает кириллицу). Вес выбирается через семейство.
const FAMILY: Record<number, string> = {
  400: 'Manrope_400Regular',
  500: 'Manrope_500Medium',
  600: 'Manrope_600SemiBold',
  700: 'Manrope_700Bold',
  800: 'Manrope_800ExtraBold',
};

function weightOf(w: any): number {
  if (w === 'bold') return 700;
  if (w === 'normal' || w == null) return 500;
  const n = parseInt(String(w), 10);
  if (n >= 800) return 800;
  if (n >= 700) return 700;
  if (n >= 600) return 600;
  if (n >= 500) return 500;
  return 400;
}

function withFont(style: any) {
  const flat: any = StyleSheet.flatten(style) || {};
  const { fontWeight, ...rest } = flat;
  return [{ fontFamily: FAMILY[weightOf(fontWeight)] }, rest];
}

export const Text = React.forwardRef<RNText, TextProps>((props, ref) => (
  <RNText ref={ref} {...props} style={withFont(props.style)} />
));

export const TextInput = React.forwardRef<RNTextInput, TextInputProps>((props, ref) => (
  <RNTextInput ref={ref} {...props} style={withFont(props.style)} />
));
