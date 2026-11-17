// SplitEase-only screens. Registered into the app shell by themes/splitease/manifest.js;
// they do not exist under other themes.
//   routes: [{ path, element, guard }]   → App.jsx adds them to <Routes>
//   nav:    [{ id, to, labelKey, ms }]  → sidebar / bottom nav items after the core ones
//   features: flags other components check via useAppTheme().features
import * as shell from './shellScreens.jsx';
import * as group from './groupScreens.jsx';

export const routes = [...shell.routes, ...group.routes];
export const nav = [...shell.nav, ...group.nav];
export const features = { ...shell.features, ...group.features };
