import { getAppTheme } from './themes/index.js';

// Mantine theme of the active app theme (see web/src/themes/).
export function mantineTheme() {
  return getAppTheme().mantine;
}
