// Text / TextInput that apply the active theme's font family per weight. Themes with
// fonts: null (classic) render exactly like the react-native components.
import React from 'react';
import { Platform, StyleSheet, Text as RNText, TextInput as RNTextInput } from 'react-native';
import { activeTheme } from './themes';

function withFont(style) {
  const fonts = activeTheme().fonts;
  if (!fonts) return style;
  const flat = StyleSheet.flatten(style) || {};
  if (flat.fontFamily) return style; // explicit family (e.g. monospace) wins
  const w = String(flat.fontWeight || '400').replace('bold', '700').replace('normal', '400');
  const family = fonts.byWeight[w] || fonts.byWeight['400'];
  // Android does not synthesise weights for custom fonts: the family carries the weight.
  return [style, { fontFamily: family }, Platform.OS === 'android' ? { fontWeight: 'normal' } : null];
}

export const Text = React.forwardRef(function Text({ style, ...p }, ref) {
  return <RNText ref={ref} style={withFont(style)} {...p} />;
});

export const TextInput = React.forwardRef(function TextInput({ style, ...p }, ref) {
  return <RNTextInput ref={ref} style={withFont(style)} {...p} />;
});
