// SplitEase ledger presentation helpers (pure; no data changes).

/** Material Symbols name per default category key. */
export const CATEGORY_ICON = {
  food: 'restaurant',
  transport: 'directions_car',
  stay: 'hotel',
  activity: 'local_activity',
  shopping: 'shopping_bag',
  health: 'medical_services',
  bills: 'receipt',
  other: 'category',
};

export function categoryIcon(key) {
  return CATEGORY_ICON[String(key || '').toLowerCase()] || 'sell';
}

export function ledgerIcon(item) {
  if (item.kind === 'payment') return 'payments';
  return categoryIcon(item.category);
}

/** Local calendar day of an ISO timestamp, e.g. "2026-10-24". */
export function dayKey(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dayLabel(iso, locale) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' });
}

export function timeLabel(iso, locale) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
}

/**
 * Index → day heading for a ledger page, keeping the API order (consecutive runs).
 * Daily total counts expenses that still affect balances (not disabled).
 */
export function dayHeads(items = []) {
  const heads = new Map();
  let current = null;
  items.forEach((item, i) => {
    const key = dayKey(item.created_at);
    if (!current || current.key !== key) {
      current = { key, at: item.created_at, total: 0 };
      heads.set(i, current);
    }
    if (item.kind === 'expense' && !item.excluded) current.total += Number(item.amount_cents) || 0;
  });
  return heads;
}

/**
 * "You lent / borrowed" from the row data the API already returns:
 * expense → my_share_cents vs. payer; payment → signed my_share_cents (+ received, − paid).
 */
export function myPosition(item, meId) {
  if (!item || item.excluded || item.reversed) return null;
  const share = Number(item.my_share_cents) || 0;
  if (item.kind === 'payment') {
    if (share > 0) return { tone: 'lent', key: 'seGroup.youReceived', cents: share };
    if (share < 0) return { tone: 'borrowed', key: 'seGroup.youPaid', cents: -share };
    return { tone: 'none', key: 'seGroup.notInvolved', cents: 0 };
  }
  if (meId && item.payer_id === meId) {
    const lent = (Number(item.amount_cents) || 0) - share;
    return lent > 0
      ? { tone: 'lent', key: 'seGroup.lent', cents: lent }
      : { tone: 'none', key: 'seGroup.paidOwn', cents: share };
  }
  if (share > 0) return { tone: 'borrowed', key: 'seGroup.borrowed', cents: share };
  return { tone: 'none', key: 'seGroup.notInvolved', cents: 0 };
}
