// Design tokens — mirrors web/src/styles.css (current web design), adapted to native.
// Web is the source of truth for colour; layout follows native patterns.
const tones = {
  open: { bg: '#fff7ed', border: '#fdba74', ink: '#c2410c', value: '#9a3412', icon: 'rgba(194,65,12,0.1)' },
  owed: { bg: '#e0f2fe', border: '#7dd3fc', ink: '#0369a1', value: '#0c4a6e', icon: 'rgba(3,105,161,0.1)' },
  groups: { bg: '#eff6ff', border: '#93c5fd', ink: '#1d4ed8', value: '#1e3a8a', icon: 'rgba(37,99,235,0.12)' },
  settled: { bg: '#e8f7ef', border: '#a7e0c2', ink: '#0c7a4b', value: '#14532d', icon: 'rgba(12,122,75,0.1)' },
};

export const colors = {
  // Brand + actions
  primary: '#16a34a',
  primaryDeep: '#149a62',
  primarySoft: '#e8f7ef',
  primaryText: '#0c7a4b',
  brandA: '#3dde84',
  brandB: '#149a62',
  ink: '#161618', // wizard-primary / dash-cta pill
  inkSoft: '#2a2e2c',
  pay: '#2563eb',
  danger: '#dc2626',
  dangerDeep: '#b91c1c',
  warn: '#b45309',

  // Surfaces + text
  page: '#f3f4f3',
  screen: '#f3f4f3',
  card: '#fff',
  cardBorder: '#e7efeb',
  line: '#e4ebe7',
  chipBg: '#f7f8f7',
  inputBorder: '#dbe4df',
  inputBg: '#fff',
  text: '#111214',
  body: '#3a3a3c',
  secondary: '#64748b',
  muted: '#94a3b8',
  navInactive: '#8394a8',
  scrim: 'rgba(0,0,0,0.55)',

  // Status chips (activity kinds / statement kinds / net chips)
  kind: {
    join: ['#e6f6ee', '#0c7a4b'],
    expense: ['#fff4e5', '#b45309'],
    payment: ['#e7f3fb', '#0369a1'],
    comment: ['#eef2f0', '#4a5651'],
    nudge: ['#fff1eb', '#c2410c'],
    paid: ['#ddf8e9', '#087a4b'],
    share: ['#fff0d8', '#a14a08'],
    payment_out: ['#e2edff', '#1759aa'],
    payment_in: ['#f0e7ff', '#7650a5'],
    owe: ['#fff0f1', '#be123c'],
    owed: ['#e9f5ff', '#0369a1'],
    settled: ['#e8f7ef', '#0c7a4b'],
  },
  tones,

  // Legacy aliases (pre-redesign names) mapped onto the new palette.
  accent: '#3dde84',
  accentLight: '#a7e0c2',
  darkTealText: '#0c7a4b',
  lightTealBg: '#e8f7ef',
  paleTealBg: '#f4faf6',
  borderTeal: '#a7e0c2',
  darkButton: '#161618',
  openBg: '#fff7ed',
  openText: '#c2410c',
  lockedBg: '#eef2f0',
  lockedText: '#4a5651',
  debtorBg: '#fff0f1',
  debtorText: '#be123c',
  owedBg: '#e9f5ff',
  owedText: '#0369a1',
  warnBg: '#fff7ed',
  warnText: '#9a3412',
  dangerCardBg: '#fef2f2',
  dangerCardBorder: '#fecaca',
  darkHero: '#102924',
};

export const radius = { card: 22, tile: 18, btn: 999, inp: 14, chip: 999, thumb: 12, seg: 12, sheet: 24 };
export const touchTarget = 44; // min 44pt

// Category tiles (web GroupDetail CATEGORY_META) + chart palette (MoneyCharts.jsx).
export const CATEGORY_META = {
  food: { emoji: '🍜', color: '#0ea5e9' },
  transport: { emoji: '🚕', color: '#8b5cf6' },
  stay: { emoji: '🏠', color: '#f59e0b' },
  activity: { emoji: '🎟', color: '#ec4899' },
  shopping: { emoji: '🛍', color: '#10b981' },
  health: { emoji: '💊', color: '#ef4444' },
  bills: { emoji: '💡', color: '#f59e0b' },
  other: { emoji: '🧾', color: '#0d9488' },
  payment: { emoji: '💸', color: '#0f172a' },
};
export const CHART_PALETTE = ['#2dd4bf', '#38bdf8', '#fb7185', '#a78bfa', '#fbbf24', '#4ade80', '#60a5fa', '#f472b6', '#34d399', '#22d3ee'];

// Soft card shadow (web: 0 8px 24px rgba(16,42,36,.04)).
export const shadow = {
  card: { shadowColor: '#102a24', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 1 },
  fab: { shadowColor: '#16a34a', shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
  dock: { shadowColor: '#105230', shadowOpacity: 0.14, shadowRadius: 13, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
};

export const type = {
  title: { fontSize: 24, fontWeight: '700', color: '#111214', letterSpacing: -0.3 },
  h1: { fontSize: 20, fontWeight: '700', color: '#111214' },
  h2: { fontSize: 16, fontWeight: '700', color: '#111214' },
  h3: { fontSize: 14, fontWeight: '700', color: '#111214' },
  body: { fontSize: 14, color: '#3a3a3c' },
  small: { fontSize: 12, color: '#64748b' },
  kicker: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: '#64748b' },
};
