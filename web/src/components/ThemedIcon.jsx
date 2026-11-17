import { useAppTheme } from '../themes/index.js';

/**
 * Theme-aware icon. `children` is the theme-neutral SVG (used by themes with
 * icons: 'svg', e.g. classic); `ms` is the Material Symbols name used by themes with
 * icons: 'material' (e.g. splitease).
 */
export function ThemedIcon({ ms, size = 22, filled = false, className = '', children }) {
  const theme = useAppTheme();
  if (theme.icons !== 'material' || !ms) return children ?? null;
  return (
    <span
      className={`ms-icon${filled ? ' is-filled' : ''}${className ? ` ${className}` : ''}`}
      style={{ fontSize: size, width: size, height: size }}
      aria-hidden
    >
      {ms}
    </span>
  );
}
