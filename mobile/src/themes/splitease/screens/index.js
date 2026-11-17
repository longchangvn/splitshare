// SplitEase-only screens, registered into the signed-in stack by App.js; absent in other themes.
//   screens:  [{ name, component, options }]  (options may be (t) => ({ ... }))
//   features: flags screens check via activeTheme().features
import * as account from './accountScreens';
import * as group from './groupScreens';

export const screens = [...account.screens, ...group.screens];
export const features = { ...account.features, ...group.features };
