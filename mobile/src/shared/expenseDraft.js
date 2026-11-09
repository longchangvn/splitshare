// AUTO-COPIED from web/src/expenseDraft.js by mobile/scripts/sync-shared.js — do not edit here.
// Edit the web file, then run `npm run sync:shared` in mobile/.
// Shared expense draft model (specs/007-consistent-add-expense). One plain-JSON draft drives
// every "add expense" entry point — Add expense, Quick Add, Copy, Edit and each Scan Receipts
// card — on web and mobile. Pure (no DOM / JSX / React): mobile gets a copy through
// mobile/scripts/sync-shared.js. The server stays authoritative (422) for every rule here.
import { normalizeDecimalInput as dec } from './decimalInput.js';

export const SPLIT_TYPES = ['EQUAL', 'EXACT', 'PERCENT', 'SHARES'];
export const MAX_MONEY_AMOUNT = 1_000_000;
export const TITLE_MAX = 100;
const MAX_CENTS = MAX_MONEY_AMOUNT * 100;
const AMOUNT_RE = /^\d{1,7}(\.\d{1,2})?$/;
const DAY_MS = 24 * 60 * 60 * 1000;

// ---------- money + dates ----------

export const todayIso = (date = new Date()) => date.toISOString().slice(0, 10);

/** Keep only digits + one `.`, max 7 integer and 2 decimal places (currency input). */
export function sanitizeMoneyInput(raw) {
  let s = dec(raw).replace(/[^\d.]/g, '');
  const dot = s.indexOf('.');
  if (dot !== -1) {
    s = `${s.slice(0, dot + 1)}${s.slice(dot + 1).replace(/\./g, '')}`;
    const [whole, frac = ''] = s.split('.');
    s = `${whole.slice(0, 7)}.${frac.slice(0, 2)}`;
  } else {
    s = s.slice(0, 7);
  }
  if (s.startsWith('.')) s = `0${s}`;
  return s;
}

export function isValidMoneyAmount(raw) {
  if (!raw || !/^\d+(\.\d{1,2})?$/.test(raw)) return false;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n <= MAX_MONEY_AMOUNT;
}

export function moneyAmountError(raw, t) {
  if (!raw) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return t('forms.payment.invalidAmount');
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return t('forms.payment.invalidAmount');
  if (n > MAX_MONEY_AMOUNT) return t('forms.payment.amountMax', { max: '1,000,000' });
  return null;
}

/** Parse a money string ("12.50") to integer cents; null when unusable. */
export function moneyToCents(raw) {
  const value = String(raw ?? '').trim();
  if (!AMOUNT_RE.test(value)) return null;
  const cents = Math.round(Number(value) * 100);
  return cents > 0 && cents <= MAX_CENTS ? cents : null;
}

/** Equal-percent distribution that sums to exactly 100.00 (mirrors server largest-remainder). */
export function equalPercent(n) {
  if (!n) return [];
  const base = Math.floor(10000 / n);
  const out = Array(n).fill(base);
  for (let i = 0; i < 10000 - base * n; i++) out[i] += 1;
  return out.map((c) => (c / 100).toString());
}

/**
 * Spent-on day: YYYY-MM-DD, a real calendar day, not later than tomorrow (UTC slack).
 * Empty passes here; `validateDraft` makes the day required.
 */
export function isValidDay(raw, now = new Date()) {
  const v = String(raw ?? '').trim();
  if (v === '') return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return false;
  return v <= todayIso(new Date(now.getTime() + DAY_MS));
}

const cents = (raw) => {
  const n = Number(raw);
  return raw === '' || raw == null || !Number.isFinite(n) ? 0 : Math.round(n * 100);
};
const toFixed2 = (c) => (c / 100).toFixed(2);

/** True when a foreign currency is set: Amount is then derived (read-only). */
export const isFxLocked = (draft) => String(draft?.origCurrency || '').trim() !== '';

/**
 * Amount in the group currency as "12.34", or null when unusable. With a foreign currency
 * the server overrides the face amount with origAmount × fxRate, so the draft does too.
 */
export function effectiveAmount(draft) {
  if (!draft) return null;
  if (isFxLocked(draft)) {
    const foreign = moneyToCents(draft.origAmount);
    const rate = Number(draft.fxRate);
    if (foreign === null || !Number.isFinite(rate) || rate <= 0) return null;
    const c = Math.round(foreign * rate);
    return c > 0 && c <= MAX_CENTS ? toFixed2(c) : null;
  }
  const c = moneyToCents(draft.amount);
  return c === null ? null : toFixed2(c);
}

/** Split base in cents = amount + tax + tip + fee (server `baseCents`; guests are on top). */
export function splitBaseCents(draft) {
  const amt = effectiveAmount(draft);
  if (amt === null) return null;
  return cents(amt) + cents(draft.tax) + cents(draft.tip) + cents(draft.fee);
}

// ---------- defaults ----------

/** Per-member split value of a source split row for a given split type. */
export function splitVal(s, type) {
  if (!s) return '';
  if (type === 'EXACT' && s.exact_cents != null) return (s.exact_cents / 100).toString();
  if (type === 'PERCENT' && s.percent != null) return s.percent.toString();
  if (type === 'SHARES' && s.shares != null) return s.shares.toString();
  return '';
}

/** Initial participant ids: edit keeps splits, copy drops former members, create = everyone. */
export function initSel({ existing, copyFrom, members = [] }) {
  const activeIds = new Set(members.map((m) => m.user_id));
  if (existing) return (existing.splits || []).map((s) => s.user_id);
  if (copyFrom) {
    const kept = (copyFrom.splits || []).map((s) => s.user_id).filter((id) => activeIds.has(id));
    return kept.length > 0 ? kept : members.map((m) => m.user_id);
  }
  return members.map((m) => m.user_id);
}

export function initValues(source, type, sel) {
  const out = {};
  if (type === 'SHARES') {
    for (const id of sel) out[id] = '1';
  }
  if (!source || !source.splits) return out;
  for (const s of source.splits) {
    if (!sel.includes(s.user_id)) continue;
    const v = splitVal(s, type);
    if (v !== '') out[s.user_id] = v;
    else if (type === 'SHARES' && !(s.user_id in out)) out[s.user_id] = '1';
  }
  return out;
}

/** Default payer: source payer if still active → me → first member. */
export function initPayer(source, members = [], meId = null) {
  const activeIds = new Set(members.map((m) => m.user_id));
  const p = source?.payer_id;
  if (p && activeIds.has(p)) return p;
  if (meId && activeIds.has(meId)) return meId;
  return members[0]?.user_id || '';
}

/** Ids in a copy source that are no longer group members. */
export function droppedMembers(copyFrom, members = []) {
  if (!copyFrom) return [];
  const activeIds = new Set(members.map((m) => m.user_id));
  return (copyFrom.splits || []).map((s) => s.user_id).filter((id) => !activeIds.has(id));
}

const hasKey = (list, key) => !!key && (list || []).some((c) => c.key === key);

/** Expense form category once the group list loads: keep → source → food → other → first. */
export function pickCategory(list, prev, sourceCategory) {
  if (hasKey(list, prev)) return prev;
  if (hasKey(list, sourceCategory)) return sourceCategory;
  return list.find((c) => c.key === 'food')?.key
    || list.find((c) => c.key === 'other')?.key
    || list[0]?.key
    || prev;
}

/** Scan card category before the scan answers: remembered → other → first. */
export function pickScanCategory(list, remembered) {
  if (hasKey(list, remembered)) return remembered;
  if (!list || list.length === 0) return remembered || 'other';
  return list.find((c) => c.key === 'other')?.key || list[0].key;
}

/** All draft fields with empty values (spentAt = today). */
export function blankDraft(now = new Date()) {
  return {
    title: '',
    amount: '',
    payerId: '',
    category: '',
    spentAt: todayIso(now),
    splitType: 'EQUAL',
    participantIds: [],
    values: {},
    stashed: {},
    tax: '',
    tip: '',
    fee: '',
    origCurrency: '',
    origAmount: '',
    fxRate: '',
    guests: [],
    onlyPresent: false,
  };
}

/**
 * Draft for a new expense. `remembered` is the output of splitMemory.restoreSplit (already
 * checked against the current members); it wins over the defaults for the fields it carries.
 */
export function newDraft({ members = [], meId = null, remembered = null, category = '', now = new Date() } = {}) {
  const d = {
    ...blankDraft(now),
    payerId: initPayer(null, members, meId),
    participantIds: members.map((m) => m.user_id),
    category,
  };
  if (!remembered) return d;
  for (const k of ['splitType', 'participantIds', 'values', 'payerId', 'category']) {
    if (remembered[k] != null && remembered[k] !== '') d[k] = remembered[k];
  }
  return d;
}

/**
 * Draft for edit (`existing`) or copy (`copyFrom`). Amount is the face amount: the API
 * total minus tax / tip / fee / guests, which the server adds back on save.
 */
export function draftFromSource({ existing = null, copyFrom = null, members = [], meId = null, title, now = new Date() }) {
  const source = existing ?? copyFrom;
  if (!source) return newDraft({ members, meId, now });
  const sel = initSel({ existing, copyFrom, members });
  const type = source.split_type || 'EQUAL';
  const guests = (source.guests || []).map((g) => ({
    label: g.label, amount: toFixed2(g.share_cents || 0), covered_by: g.covered_by,
  }));
  const face = (source.amount_cents || 0) - (source.tax_cents || 0) - (source.tip_cents || 0)
    - (source.fee_cents || 0) - (source.guests || []).reduce((a, g) => a + (g.share_cents || 0), 0);
  return {
    ...blankDraft(now),
    title: title ?? source.title ?? '',
    amount: face > 0 ? toFixed2(face) : '',
    payerId: initPayer(source, members, meId),
    category: source.category || '',
    spentAt: source.spent_at ? String(source.spent_at).slice(0, 10) : todayIso(now),
    splitType: type,
    participantIds: sel,
    values: initValues(source, type, sel),
    tax: source.tax_cents ? toFixed2(source.tax_cents) : '',
    tip: source.tip_cents ? toFixed2(source.tip_cents) : '',
    fee: source.fee_cents ? toFixed2(source.fee_cents) : '',
    origCurrency: source.orig_currency || '',
    origAmount: source.orig_amount_cents ? toFixed2(source.orig_amount_cents) : '',
    fxRate: source.fx_rate != null ? String(source.fx_rate) : '',
    guests,
  };
}

/** True when any bill-details field is filled (Bill details opens itself). */
export const hasBillDetails = (d) => !!(d && (d.tax || d.tip || d.fee || isFxLocked(d) || (d.guests || []).length));

// ---------- split edits (return a patch for the draft) ----------

/** Values after switching split type: prefill empty boxes with equal defaults (keeps typed values). */
export function valuesForType(prev, nextType, sel) {
  if (nextType === 'EQUAL') return prev;
  const checked = sel.filter((id) => !(id in prev) || prev[id] === '');
  if (checked.length === 0) return prev;
  const next = { ...prev };
  if (nextType === 'PERCENT') {
    const dist = equalPercent(sel.length);
    sel.forEach((id, i) => { if (checked.includes(id)) next[id] = dist[i]; });
  } else if (nextType === 'SHARES') {
    checked.forEach((id) => { next[id] = '1'; });
  }
  return next;
}

export function changeType(draft, nextType) {
  return { splitType: nextType, values: valuesForType(draft.values, nextType, draft.participantIds) };
}

/** Check / uncheck a participant; an unchecked member's value is stashed for re-checking. */
export function toggleParticipant(draft, id) {
  const { participantIds: sel, values, stashed = {}, splitType } = draft;
  if (sel.includes(id)) {
    const nextValues = { ...values };
    delete nextValues[id];
    return {
      participantIds: sel.filter((x) => x !== id),
      stashed: { ...stashed, ...(id in values ? { [id]: values[id] } : {}) },
      values: nextValues,
    };
  }
  let nextValues = values;
  if (id in stashed) nextValues = { ...values, [id]: stashed[id] };
  else if (splitType === 'SHARES') nextValues = { ...values, [id]: values[id] ?? '1' };
  return { participantIds: [...sel, id], values: nextValues };
}

export const setSplitValue = (draft, id, raw) => ({ values: { ...draft.values, [id]: dec(raw) } });

// ---------- request body + validation ----------

/** Request body for POST /groups/{id}/expenses, preview-split, preview-edit and PATCH. */
export function draftToBody(draft) {
  const {
    title, payerId, splitType: type, participantIds: sel, values, category, spentAt, onlyPresent,
    tax, tip, fee, origCurrency, origAmount, fxRate, guests,
  } = draft;
  const amt = effectiveAmount(draft);
  const body = {
    title: String(title || '').trim(),
    amount: amt === null ? Number(draft.amount || 0) : Number(amt),
    payer_id: payerId,
    split_type: type,
    participant_ids: sel,
    category: category || null,
    spent_at: spentAt ? new Date(`${String(spentAt).trim()}T12:00:00Z`).toISOString() : null,
    only_present: !!onlyPresent,
  };
  if (tax !== '' && tax != null) body.tax = Number(tax);
  if (tip !== '' && tip != null) body.tip = Number(tip);
  if (fee !== '' && fee != null) body.fee = Number(fee);
  if (isFxLocked(draft)) {
    body.orig_currency = origCurrency.trim().toUpperCase();
    body.orig_amount = Number(origAmount);
    body.fx_rate = Number(fxRate);
  }
  if ((guests || []).length > 0) {
    body.guests = guests.map((g) => ({
      label: g.label, amount_cents: Math.round(Number(g.amount || 0) * 100), covered_by: g.covered_by,
    }));
  }
  if (type === 'EXACT') {
    body.exact = sel.map((id) => ({ user_id: id, amount_cents: Math.round(Number(values[id] || 0) * 100) }));
  }
  if (type === 'PERCENT') {
    body.percent = sel.map((id) => ({ user_id: id, percent: Number(values[id] || 0) }));
  }
  if (type === 'SHARES') {
    // Empty box means 1 share (avoids 0 -> 422 dead-end).
    body.shares = sel.map((id) => ({
      user_id: id,
      shares: values[id] === '' || values[id] == null ? 1 : Math.max(1, Math.round(Number(values[id] || 1))),
    }));
  }
  return body;
}

/** Local split check (server 422 stays authoritative): { ok, sum } or null when n/a. */
export function splitCheck(draft) {
  const { splitType: type, participantIds: sel, values } = draft;
  if (type === 'EQUAL' || sel.length === 0) return null;
  const nums = sel.map((id) => Number(values[id] || 0));
  if (nums.some((n) => Number.isNaN(n))) return { ok: false, sum: NaN };
  const sum = nums.reduce((a, b) => a + b, 0);
  if (type === 'EXACT') {
    const base = splitBaseCents(draft);
    return { ok: base !== null && Math.round(sum * 100) === base, sum, base };
  }
  if (type === 'PERCENT') return { ok: Math.abs(sum - 100) < 1e-9, sum };
  return { ok: nums.every((n) => n >= 0), sum };
}

/** Running totals line under the split boxes. */
export function runningTotals(draft, t) {
  const check = splitCheck(draft);
  if (!check || Number.isNaN(check.sum)) return null;
  if (draft.splitType === 'EXACT') {
    return {
      text: t('forms.expense.totalsExact', { sum: check.sum.toFixed(2), total: toFixed2(check.base ?? 0) }),
      ok: check.ok,
    };
  }
  if (draft.splitType === 'PERCENT') return { text: t('forms.expense.totalsPercent', { sum: check.sum }), ok: check.ok };
  return { text: t('forms.expense.totalsShares', { sum: check.sum }), ok: true };
}

/** EQUAL explainer: floor + remainder 1¢, who gets +1¢. nameOf(id) → display name. */
export function equalNote(type, preview, { fmtCents, nameOf }, t) {
  if (type !== 'EQUAL' || !preview?.shares) return null;
  const entries = Object.entries(preview.shares);
  if (entries.length === 0) return null;
  const vals = entries.map(([, v]) => v);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const base = fmtCents(lo);
  if (hi === lo) return t('forms.expense.equalNoteOk', { base, count: entries.length });
  const lucky = entries.filter(([, v]) => v === hi).map(([id]) => nameOf(id)).join(', ');
  return t('forms.expense.equalNoteLucky', { base, count: entries.length, lucky });
}

/**
 * Field-level error codes, same everywhere (form + scan card). Empty = ready to save.
 * Codes: title, amount, rate, date, payer, participants, split.
 */
export function validateDraft(draft, members = [], now = new Date()) {
  const errors = [];
  const memberIds = members.map((m) => m.user_id);
  const title = String(draft?.title || '').trim();
  if (!title || title.length > TITLE_MAX) errors.push('title');
  if (effectiveAmount(draft) === null) errors.push('amount');
  if (isFxLocked(draft) && !(Number(draft.fxRate) > 0)) errors.push('rate');
  const day = String(draft?.spentAt || '').trim();
  if (!day || !isValidDay(day, now)) errors.push('date');
  if (!draft?.payerId || (memberIds.length > 0 && !memberIds.includes(draft.payerId))) errors.push('payer');
  const sel = draft?.participantIds || [];
  if (sel.length === 0 || sel.some((id) => memberIds.length > 0 && !memberIds.includes(id))) {
    errors.push('participants');
  }
  const check = splitCheck(draft);
  if (check && !check.ok && !errors.includes('amount')) errors.push('split');
  return { ok: errors.length === 0, errors };
}

// ---------- scan merge ----------

function isoDay(raw) {
  const value = String(raw ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function categoryKeys(group) {
  const list = Array.isArray(group?.categories) ? group.categories : [];
  return list.map((c) => String(typeof c === 'string' ? c : c?.key || '').toLowerCase()).filter(Boolean);
}

/**
 * Read one receipt of a `POST /groups/{id}/expenses/scan` response. Amount = the grand total
 * (`amount_spent`, after tax/tip): tax and tip are NOT filled, because the server adds them on
 * top of the amount. A receipt in another currency fills the FX fields and asks for a rate.
 */
export function scanReceipt(resp, group = {}) {
  const receipt = resp?.receipt && typeof resp.receipt === 'object' ? resp.receipt : {};
  const rawTotal = receipt.amount_spent ?? receipt.total ?? resp?.amount_spent ?? resp?.total ?? null;
  const total = Number(rawTotal);
  const hasTotal = rawTotal != null && Number.isFinite(total) && total > 0 && total <= MAX_MONEY_AMOUNT;
  const confidence = receipt.confidence?.total ?? resp?.confidence ?? null;
  const warnings = [...new Set([
    ...(Array.isArray(receipt.warnings) ? receipt.warnings : []),
    ...(receipt.warnings ? [] : (Array.isArray(resp?.warnings) ? resp.warnings : [])),
  ])];
  const merchant = typeof receipt.merchant === 'string' ? receipt.merchant.trim() : '';
  const summary = typeof receipt.summary === 'string' ? receipt.summary.trim() : '';
  const receiptCurrency = typeof receipt.currency === 'string' ? receipt.currency.trim().toUpperCase() : '';
  const groupCurrency = String(group?.currency || '').trim().toUpperCase();
  const mismatch = !!receiptCurrency && !!groupCurrency && receiptCurrency !== groupCurrency;
  const keys = categoryKeys(group);
  const scannedCategory = String(receipt.category || '').trim().toLowerCase();
  return {
    hasTotal,
    mismatch,
    lowConfidence: confidence === 'low' || !hasTotal,
    warnings,
    receiptCurrency: mismatch ? receiptCurrency : '',
    fields: {
      title: (merchant || summary).slice(0, TITLE_MAX),
      amount: hasTotal && !mismatch ? total.toFixed(2) : '',
      spentAt: isoDay(receipt.date) || '',
      category: keys.length === 0 || keys.includes(scannedCategory) ? scannedCategory : '',
      origCurrency: mismatch ? receiptCurrency : '',
      origAmount: mismatch && hasTotal ? total.toFixed(2) : '',
      fxRate: '',
    },
  };
}

/**
 * Draft patch from a scanned receipt. `keep(field)` → true leaves that field alone (the
 * expense form keeps what the user already changed). Amount and the FX trio move together.
 */
export function applyScan(draft, resp, group = {}, { keep = () => false } = {}) {
  const scan = scanReceipt(resp, group);
  const f = scan.fields;
  const patch = {};
  if (f.title && !keep('title')) patch.title = f.title;
  if (f.spentAt && !keep('spentAt')) patch.spentAt = f.spentAt;
  if (f.category && !keep('category')) patch.category = f.category;
  if (scan.mismatch) {
    Object.assign(patch, { amount: '', origCurrency: f.origCurrency, origAmount: f.origAmount, fxRate: '' });
  } else if (f.amount) {
    Object.assign(patch, { amount: f.amount, origCurrency: '', origAmount: '', fxRate: '' });
  }
  return { patch, scan };
}
