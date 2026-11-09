// AUTO-COPIED from web/src/splitMemory.js by mobile/scripts/sync-shared.js — do not edit here.
// Edit the web file, then run `npm run sync:shared` in mobile/.
// Remembered split per user + group (specs/007-consistent-add-expense). Pure: the storage
// adapters (web localStorage, mobile AsyncStorage) only move the JSON from snapshotSplit.
// Mobile gets a copy through mobile/scripts/sync-shared.js.
import { SPLIT_TYPES, equalPercent, initPayer } from './expenseDraft.js';

export const SPLIT_MEMORY_PREFIX = 'ss-last-split:v1:';

export const splitMemoryKey = (userId, groupId) => `${SPLIT_MEMORY_PREFIX}${userId}:${groupId}`;

/**
 * What to store after a successful create. EXACT amounts belong to one bill, so only the
 * method is kept; PERCENT / SHARES values are kept for the checked members.
 */
export function snapshotSplit(draft) {
  const type = SPLIT_TYPES.includes(draft?.splitType) ? draft.splitType : 'EQUAL';
  const sel = Array.isArray(draft?.participantIds) ? [...draft.participantIds] : [];
  const values = {};
  if (type === 'PERCENT' || type === 'SHARES') {
    for (const id of sel) {
      const v = draft.values?.[id];
      if (v !== undefined && v !== '') values[id] = String(v);
    }
  }
  return {
    splitType: type,
    participantIds: sel,
    values,
    payerId: draft?.payerId || '',
    category: draft?.category || '',
  };
}

/** Stored JSON → object, or null when missing / corrupt. */
export function parseSplit(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

const isPositiveInt = (v) => /^\d+$/.test(String(v)) && Number(v) >= 1;
const isPercent = (v) => v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 100;

/**
 * Remembered split checked against the current group. Returns draft fields
 * { splitType, participantIds, values, payerId, category } or null.
 *  - members who left are dropped; none left → everyone
 *  - PERCENT values survive only if the same members remain and still sum to 100, else equal %
 *  - SHARES keep positive whole numbers, else 1
 *  - context 'scan': EXACT starts as EQUAL (amounts differ per receipt)
 *  - payer who left → me → first member; category is checked later against the group list
 */
export function restoreSplit(saved, { members = [], meId = null, context = 'form' } = {}) {
  const s = parseSplit(saved);
  if (!s || !SPLIT_TYPES.includes(s.splitType) || members.length === 0) return null;
  const active = new Set(members.map((m) => m.user_id));
  const savedSel = Array.isArray(s.participantIds) ? s.participantIds.filter((id) => typeof id === 'string') : [];
  let sel = savedSel.filter((id) => active.has(id));
  if (sel.length === 0) sel = members.map((m) => m.user_id);
  const type = context === 'scan' && s.splitType === 'EXACT' ? 'EQUAL' : s.splitType;
  const savedValues = s.values && typeof s.values === 'object' ? s.values : {};

  let values = {};
  if (type === 'PERCENT') {
    const same = sel.length === savedSel.length && sel.every((id) => isPercent(savedValues[id]));
    const sum = same ? sel.reduce((a, id) => a + Number(savedValues[id]), 0) : 0;
    if (same && Math.abs(sum - 100) < 1e-9) {
      for (const id of sel) values[id] = String(savedValues[id]);
    } else {
      const dist = equalPercent(sel.length);
      sel.forEach((id, i) => { values[id] = dist[i]; });
    }
  } else if (type === 'SHARES') {
    for (const id of sel) values[id] = isPositiveInt(savedValues[id]) ? String(Number(savedValues[id])) : '1';
  } else {
    values = {};
  }

  const payerId = s.payerId && active.has(s.payerId) ? s.payerId : initPayer(null, members, meId);
  const category = typeof s.category === 'string' ? s.category : '';
  return { splitType: type, participantIds: sel, values, payerId, category };
}
