// Extra tokens for the group / expense / payment screens (owned separately from index.js).
// Any key added here must exist in every theme; classic values = the current look.
// SplitEase values follow the Stitch palette (primary #006948, mint #85f8c4, slate #565e74).
export default {
  lifecycle: {
    opening: ['#c9f2de', '#005137'],
    locked: ['#ffddb7', '#6a3c00'],
    closed: ['#e0e3e5', '#3d4a42'],
  },
  roleTone: {
    owner: ['#c9f2de', '#005137'],
    treasurer: ['#dae2fd', '#3f465c'],
    member: ['#eceef0', '#3d4a42'],
  },
  tagOn: ['#c9f2de', '#005137'],
  tagDue: ['#ffddb7', '#6a3c00'],
  tagOff: ['#eceef0', '#565e74'],
  warnDot: '#b26a00',
  barTrack: '#e6e8ea',
  filterBtnBg: '#f2f4f6',
  payHintBg: '#f2f4f6',
  payHintBorder: '#e6e8ea',
  payHandleBg: '#fff',
  payHandleBorder: '#e0e3e5',
  historicalBorder: '#ffb95c',
  glyphBg: '#fff',
  reportPaid: '#006948',
  reportShare: '#68dba9',
  // helpers.js MEMBER_PALETTE / CATEGORY_COLORS literals → SplitEase CHART_PALETTE.
  chartRemap: {
    '#2dd4bf': '#006948',
    '#38bdf8': '#68dba9',
    '#fbbf24': '#565e74',
    '#a78bfa': '#bec6e0',
    '#fb7185': '#00855d',
    '#4ade80': '#b26a00',
    '#60a5fa': '#6750a4',
    '#f472b6': '#ba1a1a',
    '#34d399': '#4edea3',
    '#22d3ee': '#3d4a42',
  },
  lent: '#006948',
  borrowed: '#ba1a1a',
  qrDark: '#191c1e',
  qrLight: '#fff',
};
