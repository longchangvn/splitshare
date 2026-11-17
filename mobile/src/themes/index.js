// Theme registry. React Native styles are created at module load, so the theme is
// chosen once at startup by src/themes/Boot.js before App (and every screen) loads:
//   1. the name the API last returned in GET /capabilities → { theme } (saved for next launch),
//   2. else build config: EXPO_PUBLIC_THEME, then app.json expo.extra.theme,
//   3. else DEFAULT_THEME.
// Switching on the server (Ui__Theme) therefore applies on the app's next launch.
import classic from './classic';
import splitease from './splitease';

export const THEMES = { classic, splitease };
export const DEFAULT_THEME = 'splitease';
export const THEME_STORAGE_KEY = 'ss-app-theme';

let active = THEMES[DEFAULT_THEME];

export function setActiveTheme(name) {
  active = THEMES[name] || THEMES[DEFAULT_THEME];
  return active;
}

export function activeTheme() {
  return active;
}

/** Theme-mapped colour for a literal that is hard-coded in a screen style. */
export function tk(hex) {
  return active.hex[hex] ?? hex;
}
