// Pure helpers for the group workstream (GroupDetail tabs, Settlement, Report, Statement).
// No react-native imports so node --test can exercise them (mobile/test/group-*.test.mjs).
// Rules mirror web/src/pages/GroupDetail.jsx + Report.jsx + MoneyCharts.jsx.

export const ACTIVITY_PAGE_SIZE = 10;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateInput(s) {
  if (!s) return true;
  if (!DATE_RE.test(s)) return false;
  return !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime());
}

/** Default ledger filters — archive view: default scope is active (OPEN); LOCKED = Archived. */
export const DEFAULT_FILTERS = Object.freeze({
  payer: '', status: 'OPEN', cat: '', min: '', max: '', from: '', to: '', sort: 'newest',
});

/** Badge count for the collapsible filter button (web activeFilters). */
export function activeFilterCount(f) {
  return [f.payer, f.cat, f.min, f.max, f.from, f.to].filter((v) => v !== '' && v != null).length
    + (f.status && f.status !== 'OPEN' ? 1 : 0)
    + (f.sort === 'newest' ? 0 : 1);
}

/** Query string for GET /groups/:id/ledger — same params as web loadLedger. Status is always explicit. */
export function buildLedgerQuery({ type = 'all', q = '', limit = 100 } = {}, f = DEFAULT_FILTERS) {
  const parts = [['type', type], ['q', q], ['limit', String(limit)]];
  if (f.payer) parts.push(['payer_id', f.payer]);
  if (f.status) parts.push(['status', f.status]);
  if (f.cat) parts.push(['category', f.cat]);
  if (f.min !== '' && f.min != null && Number.isFinite(Number(f.min))) parts.push(['min_amount', String(Math.round(Number(f.min) * 100))]);
  if (f.max !== '' && f.max != null && Number.isFinite(Number(f.max))) parts.push(['max_amount', String(Math.round(Number(f.max) * 100))]);
  if (f.from && isValidDateInput(f.from)) parts.push(['from_date', new Date(`${f.from}T00:00:00Z`).toISOString()]);
  if (f.to && isValidDateInput(f.to)) parts.push(['to_date', new Date(`${f.to}T23:59:59Z`).toISOString()]);
  if (f.sort === 'oldest') parts.push(['sort', 'created_at']);
  return parts.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
}

/** Web canWriteGroup: opening → everyone; locked → owner only; closed → nobody. */
export function canWriteGroup(detail) {
  const st = detail?.status || 'opening';
  return st === 'opening' || (st === 'locked' && detail?.my_role === 'owner');
}

/** Creator, owner or treasurer can edit OPEN expenses (API GuardAsync). */
export function canEditExpense(item, detail, meId) {
  if (!item || item.kind !== 'expense') return false;
  if (!canWriteGroup(detail)) return false;
  if (String(item.status || '').toUpperCase() === 'LOCKED') return false;
  const role = detail?.my_role;
  if (role === 'owner' || role === 'treasurer') return true;
  return !!(meId && item.created_by && item.created_by === meId);
}

/** Payment reversal: owner/treasurer, OPEN, not reversed, within 24h (PaymentService.ReverseAsync). */
export function canReversePayment(p, detail, now = Date.now()) {
  if (!p || p.reversed) return false;
  if (String(p.status || '').toUpperCase() !== 'OPEN') return false;
  const role = detail?.my_role;
  if (role !== 'owner' && role !== 'treasurer') return false;
  const at = new Date(p.created_at).getTime();
  if (!Number.isFinite(at)) return true; // let the server decide
  return now - at <= 24 * 3600 * 1000;
}

/** Group-level settlement status (not personal net). null = unknown. */
export function groupSettledOf(plan, summary) {
  if (plan) return (plan.transfers || []).length === 0;
  if (Array.isArray(summary)) return summary.every((m) => (m.net_cents || 0) === 0);
  return null;
}

export function hasLedgerHistory(summary) {
  return (summary || []).some((m) => (m.total_paid_cents || 0) > 0 || (m.total_share_cents || 0) > 0);
}

/** Which empty state to show for an empty ledger page: 'archive' | 'settled' | 'active'. */
export function ledgerEmptyKind(status, groupSettled, history) {
  if (status === 'LOCKED') return 'archive';
  if (groupSettled && history) return 'settled';
  return 'active';
}

/** Settlement transfers grouped by debtor, insertion order preserved. */
export function groupByDebtor(transfers) {
  const m = new Map();
  for (const t of transfers || []) {
    if (!m.has(t.from_user_id)) m.set(t.from_user_id, []);
    m.get(t.from_user_id).push(t);
  }
  return [...m.entries()];
}

/** Merge payment history + activity (skip activity kind=payment to avoid duplicates), newest first. */
export function mergeActivityFeed(payments, activity) {
  const payRows = (payments || []).map((p) => ({ key: `pay-${p.id}`, sortAt: p.created_at, kind: 'payment', payment: p }));
  const actRows = (Array.isArray(activity) ? activity : [])
    .filter((a) => a.kind !== 'payment')
    .map((a, i) => ({ key: `act-${a.kind}-${a.at}-${i}`, sortAt: a.at, kind: a.kind, activity: a }));
  return [...payRows, ...actRows].sort((a, b) => new Date(b.sortAt) - new Date(a.sortAt));
}

export function paginate(list, page, size = ACTIVITY_PAGE_SIZE) {
  const count = Math.max(1, Math.ceil((list || []).length / size));
  const safe = Math.min(Math.max(1, page), count);
  const start = (safe - 1) * size;
  return { page: safe, count, items: (list || []).slice(start, start + size), from: start + 1, to: Math.min(start + size, (list || []).length) };
}

export function netTone(cents) {
  if (!cents) return 'settled';
  return cents < 0 ? 'owe' : 'owed';
}

export function pct(value, total) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

// ---- Chart colours (web MoneyCharts.jsx chartColorsFor) ----
const MEMBER_PALETTE = ['#2dd4bf', '#38bdf8', '#fbbf24', '#a78bfa', '#fb7185', '#4ade80', '#60a5fa', '#f472b6', '#34d399', '#22d3ee'];
const CATEGORY_COLORS = {
  activity: '#4ade80', food: '#fbbf24', health: '#fb7185', other: '#a78bfa', shopping: '#f472b6', stay: '#22d3ee', transport: '#60a5fa',
};
const CATEGORY_PALETTE = ['#22d3ee', '#fbbf24', '#4ade80', '#a78bfa', '#fb7185', '#60a5fa', '#2dd4bf', '#f472b6'];

export function chartColorsFor(keys, mode = 'member') {
  const unique = [...new Set((keys || []).map((k) => String(k)))].sort();
  if (mode === 'member') return new Map(unique.map((k, i) => [k, MEMBER_PALETTE[i % MEMBER_PALETTE.length]]));
  const out = new Map();
  const used = new Set();
  unique.forEach((k) => { if (CATEGORY_COLORS[k]) { out.set(k, CATEGORY_COLORS[k]); used.add(CATEGORY_COLORS[k]); } });
  let i = 0;
  unique.forEach((k) => {
    if (out.has(k)) return;
    let guard = 0;
    while (used.has(CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]) && guard < CATEGORY_PALETTE.length) { i += 1; guard += 1; }
    const c = CATEGORY_PALETTE[i % CATEGORY_PALETTE.length];
    out.set(k, c); used.add(c); i += 1;
  });
  return out;
}

/** Breakdown rows → sorted category rows with translated labels (web Report categoryRows). */
export function categoryRowsOf(breakdown, t) {
  return [...(breakdown || [])]
    .map((b) => {
      const cat = String(b.category || 'other').trim().toLowerCase() || 'other';
      const k = `forms.expense.cat.${cat}`;
      const tr = t(k);
      return { key: cat, label: tr === k ? (b.category || t('forms.expense.cat.other')) : tr, count: b.expense_count || 0, value: b.paid_cents || 0 };
    })
    .sort((a, b) => b.value - a.value);
}

/** Positive-only distribution rows with share-of-total percent + colour. */
export function distributionOf(rows, mode = 'member') {
  const colors = chartColorsFor((rows || []).map((r) => r.key), mode);
  const data = (rows || []).filter((r) => (r.value || 0) > 0);
  const total = data.reduce((a, r) => a + r.value, 0);
  return { total, rows: data.map((r) => ({ ...r, color: colors.get(String(r.key)), pct: pct(r.value, total) })) };
}

/** Split an emails textarea the same way as web (commas, spaces, semicolons, new lines). */
export function parseEmails(raw) {
  return String(raw || '').split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
}
