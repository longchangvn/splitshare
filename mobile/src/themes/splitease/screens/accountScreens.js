// SplitEase-only account/home screens + feature flags (registered by ./index.js).
// Components are required lazily: this module loads before the theme is active, and
// screen modules build their StyleSheets from the active theme at import time.
import React from 'react';

function Archived(props) {
  const Screen = require('./ArchivedGroupsScreen').default;
  return <Screen {...props} />;
}

export const screens = [
  { name: 'Archived', component: Archived, options: (t) => ({ title: t('se.archived.title') }) },
];

export const features = {
  flatTabBar: true, // tab bar takes layout space (no floating dock): tab screens need less bottom padding
  lightAuth: true, // AuthLayout: light centred header instead of the dark hero
  quickPass: true, // Login: biometric unlock as a "Quick Pass" card
  homeDashboard: true, // Home: net-balance summary + active-group cards (themes/splitease/components/HomeDashboard)
  groupRows: true, // Groups board: compact card rows (themes/splitease/components/GroupRow)
  archivedGroups: true, // Archived screen + entry points in Settings and Groups
  profileHero: true, // Profile: centred avatar header card (Stitch M6)
  iconTiles: true, // settings rows / section headers show Material icon tiles
};
