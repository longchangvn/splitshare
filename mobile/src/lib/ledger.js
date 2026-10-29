// Ledger query + totals — mirrors web/src/pages/GroupDetail.jsx `loadLedger`.
// The same filter state must produce the same query string on both clients so
// numbers never diverge (spec 005 task 2.3).

export const LEDGER_STATUSES = ['OPEN', 'LOCKED'];
export const LEDGER_TYPES = ['', 'expense', 'payment'];
export const DEFAULT_FILTERS = {
  type: '',
  q: '',
  payer_id: '',
  status: 'OPEN',
  category: '',
  min_amount: '',
  max_amount: '',
  from_date: '',
  to_date: '',
  sort: 'created_at_desc',
};

function isoDayStart(day) {
  return new Date(`${day}T00:00:00Z`).toISOString();
}
function isoDayEnd(day) {
  return new Date(`${day}T23:59:59Z`).toISOString();
}

/**
 * Build the ledger path. Parameter order matches the web client
 * (type, q, limit, payer_id, status, category, min_amount, max_amount,
 * from_date, to_date, sort) so request logs are comparable.
 */
export function buildLedgerQuery(groupId, filters = {}, limit = 100) {
  const f = { ...DEFAULT_FILTERS, ...(filters || {}) };
  // Built by hand (not URLSearchParams) so the string is identical on Hermes
  // and Node, where the polyfill differs.
  const parts = [
    `type=${encodeURIComponent(f.type || '')}`,
    `q=${encodeURIComponent(f.q || '')}`,
    `limit=${limit}`,
  ];
  if (f.payer_id) parts.push(`payer_id=${encodeURIComponent(f.payer_id)}`);
  if (f.status) parts.push(`status=${encodeURIComponent(f.status)}`);
  if (f.category) parts.push(`category=${encodeURIComponent(f.category)}`);
  if (f.min_amount !== '') parts.push(`min_amount=${Math.round(Number(f.min_amount) * 100)}`);
  if (f.max_amount !== '') parts.push(`max_amount=${Math.round(Number(f.max_amount) * 100)}`);
  if (f.from_date) parts.push(`from_date=${encodeURIComponent(isoDayStart(f.from_date))}`);
  if (f.to_date) parts.push(`to_date=${encodeURIComponent(isoDayEnd(f.to_date))}`);
  if (f.sort === 'oldest') parts.push('sort=created_at');
  return `/api/v1/groups/${groupId}/ledger?${parts.join('&')}`;
}

/** Number of active filter fields (the "Filters · n" badge). */
export function activeFilterCount(filters = {}, { ignoreStatus = true } = {}) {
  const f = { ...DEFAULT_FILTERS, ...(filters || {}) };
  let n = 0;
  if (f.type) n += 1;
  if (f.payer_id) n += 1;
  if (!ignoreStatus && f.status) n += 1;
  if (f.category) n += 1;
  if (f.min_amount !== '') n += 1;
  if (f.max_amount !== '') n += 1;
  if (f.from_date) n += 1;
  if (f.to_date) n += 1;
  if (f.sort === 'oldest') n += 1;
  return n;
}

/** Loaded-page totals, exactly like the web footer. */
export function ledgerTotals(items = []) {
  return (Array.isArray(items) ? items : []).reduce(
    (acc, it) => ({
      amount: acc.amount + (Number(it.amount_cents) || 0),
      mine: acc.mine + (Number(it.my_share_cents) || 0),
    }),
    { amount: 0, mine: 0 },
  );
}

export function isPaymentRow(row) {
  return (row?.kind || row?.type) === 'payment';
}

export function rowKey(row, index = 0) {
  return `${row?.kind || row?.type || 'row'}-${row?.id || row?.expense_id || row?.payment_id || index}`;
}

/** Copyable summary line for a ledger row (used by "copy to clipboard"). */
export function rowSummary(row, currency, nameOf) {
  if (isPaymentRow(row)) {
    return `${nameOf(row.from_user_id)} → ${nameOf(row.to_user_id)} ${row.amount_cents || 0} ${currency}`;
  }
  return `${row.title || 'Expense'} · ${row.amount_cents || 0} ${currency}`;
}

/** The three distinct empty states the web ledger distinguishes. */
export function ledgerEmptyState({ archived, hasHistory, transfers = 0 }) {
  if (archived) return 'archive';
  if (hasHistory && transfers === 0) return 'all-settled';
  return 'none';
}
