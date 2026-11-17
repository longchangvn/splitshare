// Persists the theme the API asks for (GET /capabilities → { theme }) so Boot.js applies
// it on the next launch. No theme from the server → clear, so the build default applies.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { THEMES, THEME_STORAGE_KEY } from './index';

export function rememberServerTheme(name) {
  const op = THEMES[name] ? AsyncStorage.setItem(THEME_STORAGE_KEY, name) : AsyncStorage.removeItem(THEME_STORAGE_KEY);
  op.catch(() => {});
}
