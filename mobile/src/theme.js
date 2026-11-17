// Design tokens of the active theme (src/themes/<name>/index.js). Screens import from
// here; the theme is fixed at startup by src/themes/Boot.js.
import { activeTheme } from './themes';

const t = activeTheme();

export const colors = t.colors;
export const radius = t.radius;
export const touchTarget = t.touchTarget;
export const CATEGORY_META = t.CATEGORY_META;
export const CHART_PALETTE = t.CHART_PALETTE;
export const shadow = t.shadow;
export const type = t.type;
export const groupTokens = t.group;
export { tk } from './themes';
