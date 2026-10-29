// Pure helpers for the Home / Groups / Activity / New-group screens.
// Mirrors private helpers in web/src/pages/Dashboard.jsx. Plain JS (no JSX, no
// react-native imports) so node --test can execute it directly.

export const DEFAULT_CURRENCY = 'USD';
export const ACTIVITY_PAGE_SIZE = 10;
export const GROUP_STATUSES = ['opening', 'locked', 'closed'];
export const ACTIVITY_KIND_KEYS = ['join', 'expense', 'payment', 'comment', 'nudge'];

/** True when the group still has open member balances (not personal net). */
export function groupNeedsSettlement(group) {
  if (group?.needs_settlement != null) return !!group.needs_settlement;
  // Older API builds: oldest_unsettled_at is set iff any member net ≠ 0.
  if (group?.oldest_unsettled_at != null) return true;
  return false;
}

export const statusOf = (g) => g?.status || 'opening';

/** Settled/open counts + settled percentage (web dashboard gauge + banner). */
export function settleStats(groups = []) {
  const list = Array.isArray(groups) ? groups : [];
  const settled = list.filter((g) => !groupNeedsSettlement(g)).length;
  const open = Math.max(0, list.length - settled);
  const pct = list.length ? Math.round((settled / list.length) * 100) : 0;
  return { total: list.length, settled, open, pct };
}

/** Newest groups first (web home "Groups" card shows the top 5). */
export function recentGroups(groups = [], n = 5) {
  return [...(Array.isArray(groups) ? groups : [])]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, n);
}

/** Group rows → activity rows tagged with the group, merged newest first. */
export function mergeActivity(lists = []) {
  return lists.flat().sort((a, b) => new Date(b.at) - new Date(a.at));
}

/** Page window for a flat list (web ActivityFeed pager). */
export function pageSlice(items = [], page = 1, size = ACTIVITY_PAGE_SIZE) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const from = total === 0 ? 0 : (safePage - 1) * size + 1;
  const to = Math.min(safePage * size, total);
  return { total, totalPages, page: safePage, from, to, items: items.slice((safePage - 1) * size, safePage * size) };
}

/** Numbered pager tokens with ellipses (verbatim from web activityPageTokens). */
export function activityPageTokens(current, total) {
  if (total <= 1) return [1];
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const marks = new Set([1, total, current - 1, current, current + 1]);
  if (current <= 3) [2, 3, 4].forEach((n) => marks.add(n));
  if (current >= total - 2) [total - 3, total - 2, total - 1].forEach((n) => marks.add(n));
  const nums = [...marks].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const tokens = [];
  for (let i = 0; i < nums.length; i += 1) {
    if (i > 0 && nums[i] - nums[i - 1] > 1) tokens.push('…');
    tokens.push(nums[i]);
  }
  return tokens;
}

/** Normalise an activity kind to a known key or 'other'. */
export function kindKey(kind) {
  const key = String(kind || 'other').toLowerCase();
  return ACTIVITY_KIND_KEYS.includes(key) ? key : 'other';
}

/** Contacts sorted by display name (web wizard box + quick-add list). */
export function sortByName(list, field = 'display_name') {
  return [...(Array.isArray(list) ? list : [])]
    .sort((a, b) => String(a?.[field]).localeCompare(String(b?.[field])));
}

/** "a@x.com, b@y.com; c@z" → ['a@x.com','b@y.com','c@z'] (web wizard split). */
export function parseEmails(raw) {
  return String(raw || '').split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
}

/** Wizard group-name rule (web nameOk): 3–50 chars after trim. */
export function nameOk(name) {
  const n = String(name || '').trim().length;
  return n >= 3 && n <= 50;
}

/** Pre-picked people stay visible even when outside the top-20 box (web boxContacts). */
export function boxContacts(picked = [], myContacts = []) {
  return [
    ...picked.filter((p) => !myContacts.some((c) => c.user_id === p.user_id)),
    ...myContacts,
  ];
}

/** Tolerate list endpoints that return either an array or {items|groups|contacts}. */
export function asList(r, ...keys) {
  if (Array.isArray(r)) return r;
  for (const k of keys) if (Array.isArray(r?.[k])) return r[k];
  return [];
}
