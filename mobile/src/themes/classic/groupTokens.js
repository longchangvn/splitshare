// Extra tokens for the group / expense / payment screens (owned separately from index.js).
// Any key added here must exist in every theme; classic values = the current look.
export default {
  // Group lifecycle chip [bg, fg] (GroupScreen hero).
  lifecycle: {
    opening: ['#e8f7ef', '#0c7a4b'],
    locked: ['#fff7ed', '#c2410c'],
    closed: ['#eef2f0', '#4a5651'],
  },
  // Member role tag [bg, fg] (PeopleTab).
  roleTone: {
    owner: ['#e8f7ef', '#0c7a4b'],
    treasurer: ['#eff6ff', '#1d4ed8'],
    member: ['#f1f5f9', '#475569'],
  },
  // Deposit + recurring on/off tags [bg, fg].
  tagOn: ['#e8f7ef', '#0c7a4b'],
  tagDue: ['#fff7ed', '#c2410c'],
  tagOff: ['#f1f5f9', '#64748b'],
  // Status dots in the lifecycle picker / budget "near" bar.
  warnDot: '#f59e0b',
  barTrack: '#eef2f0',
  // Ledger filter button background.
  filterBtnBg: '#fff',
  // Pay screen: receiver handles box + rows.
  payHintBg: '#eff6ff',
  payHintBorder: '#bfdbfe',
  payHandleBg: '#fff',
  payHandleBorder: '#dbeafe',
  // Settlement: historical banner border, status glyph disc.
  historicalBorder: '#fdba74',
  glyphBg: '#fff',
  // Report: paid vs share bars.
  reportPaid: '#14b8a6',
  reportShare: '#38bdf8',
  // Chart colour remap for helpers.chartColorsFor output (literal → theme colour). Identity here.
  chartRemap: {},
  // Ledger "my impact" labels (used only when a theme turns on features.ledgerByDate).
  lent: '#0c7a4b',
  borrowed: '#be123c',
  // Invite QR modules (used only with features.inviteQr).
  qrDark: '#111214',
  qrLight: '#fff',
};
