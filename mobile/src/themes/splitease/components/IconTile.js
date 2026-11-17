// Rounded-square tile holding a Material icon (Stitch "icon tile"). Renders nothing in
// glyph-icon themes, so shared screens can pass `ms` without changing the classic look.
import React from 'react';
import { View } from 'react-native';
import { activeTheme } from '../../index';
import { ThemedIcon } from '../../../components/ThemedIcon';

export const MINT = { bg: '#e3f7ee', fg: '#006948' };
export const GREY = { bg: '#eceef0', fg: '#3d4a42' };
export const RED = { bg: '#ffdad6', fg: '#ba1a1a' };
export const SLATE = { bg: '#dae2fd', fg: '#3f465c' };

export function IconTile({ ms, size = 40, tone = MINT, round = false, style }) {
  if (activeTheme().icons !== 'material' || !ms) return null;
  return (
    <View
      style={[{
        width: size, height: size, borderRadius: round ? size / 2 : Math.round(size * 0.28),
        backgroundColor: tone.bg, alignItems: 'center', justifyContent: 'center',
      }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <ThemedIcon ms={ms} size={Math.round(size * 0.52)} color={tone.fg} />
    </View>
  );
}
