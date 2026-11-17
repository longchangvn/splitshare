// Theme-aware icon. `children` is the glyph/emoji used by themes with icons: 'glyph'
// (classic); `ms` is a Material icon name (snake_case, as in the Stitch design) used by
// themes with icons: 'material' (splitease).
import React from 'react';
import { activeTheme } from '../themes';
import { Text } from '../typography';

export function ThemedIcon({ ms, size = 20, color, style, children }) {
  if (activeTheme().icons !== 'material' || !ms) {
    if (children == null) return null;
    return typeof children === 'string' ? <Text style={[{ fontSize: size, color }, style]}>{children}</Text> : children;
  }
  const { MaterialIcons } = require('@expo/vector-icons');
  return <MaterialIcons name={ms.replace(/_/g, '-')} size={size} color={color} style={style} />;
}
