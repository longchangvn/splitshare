// Activity feed rules — one place for both the group Activity screen and the
// global feed (spec 005 tasks 3.8/3.9).
// Plain JS so node --test can execute it.

export const ACTIVITY_PAGE_SIZE = 10;
export const GLOBAL_PAGE_SIZE = 20;
export const MAX_GLOBAL_LIMIT = 200;

/**
 * Merge completed payments with group updates, newest first, skipping the
 * activity kind=payment rows because payments are rendered from the ledger
 * (web GroupDetail `activityFeed` does the same to avoid duplicates).
 */
export function mergeGroupActivity(payments = [], activity = []) {
  const payRows = (Array.isArray(payments) ? payments : []).map((p) => ({
    key: `pay-${p.id}`,
    sortAt: p.created_at,
    kind: 'payment',
    payment: p,
  }));
  const actRows = (Array.isArray(activity) ? activity : [])
    .filter((a) => a.kind !== 'payment')
    .map((a, i) => ({
      key: `act-${a.kind}-${a.at}-${i}`,
      sortAt: a.at,
      kind: a.kind,
      activity: a,
    }));
  return [...payRows, ...actRows].sort((a, b) => new Date(b.sortAt) - new Date(a.sortAt));
}

export function pageCount(total, size = ACTIVITY_PAGE_SIZE) {
  return Math.max(1, Math.ceil(total / size));
}

export function pageSlice(rows = [], page = 1, size = ACTIVITY_PAGE_SIZE) {
  const safe = Math.min(Math.max(1, page), pageCount(rows.length, size));
  const start = (safe - 1) * size;
  return { page: safe, rows: rows.slice(start, start + size), total: rows.length };
}

/** Path for GET /me/activity (D1). `before` is the cursor from the last row. */
export function buildGlobalActivityQuery({ limit = GLOBAL_PAGE_SIZE, before, groupId } = {}) {
  const capped = Math.max(1, Math.min(Number(limit) || GLOBAL_PAGE_SIZE, MAX_GLOBAL_LIMIT));
  const parts = [`limit=${capped}`];
  if (before) parts.push(`before=${encodeURIComponent(before)}`);
  if (groupId) parts.push(`group_id=${encodeURIComponent(groupId)}`);
  return `/api/v1/me/activity?${parts.join('&')}`;
}

/** Cursor for the next page: the oldest timestamp on the current page. */
export function nextCursor(rows = []) {
  if (!rows.length) return null;
  const oldest = rows.reduce(
    (min, r) => (!min || new Date(r.at) < new Date(min) ? r.at : min),
    null,
  );
  return oldest || null;
}

/**
 * Fallback when the API has no `features.activity_feed`: fan out per group and
 * merge. Kept pure so the fallback path is unit-tested without a network.
 */
export function fanOutGlobalActivity(groupFeeds = []) {
  const rows = [];
  for (const feed of Array.isArray(groupFeeds) ? groupFeeds : []) {
    const groupId = feed?.group_id;
    const groupName = feed?.group_name || '';
    for (const row of Array.isArray(feed?.rows) ? feed.rows : []) {
      rows.push({ ...row, group_id: groupId, group_name: groupName });
    }
  }
  return rows.sort((a, b) => new Date(b.at) - new Date(a.at));
}

/** True when the capabilities payload advertises the global feed. */
export function hasGlobalActivity(capabilities) {
  return !!capabilities?.features?.activity_feed;
}

export function hasPushDevices(capabilities) {
  return !!capabilities?.features?.push_devices;
}
