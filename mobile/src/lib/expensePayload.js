// Expense request body — MUST stay byte-identical to web `Forms.jsx build()`
// for the same input (spec 005 task 3.2). Plain JS, unit-tested.
import { moneyFieldError } from './money.js';

export const SPLIT_TYPES = ['EQUAL', 'EXACT', 'PERCENT', 'SHARES'];

/** Equal percent distribution with the 0.01 remainder on the first members. */
export function equalPercent(n) {
  if (!n) return [];
  const base = Math.floor(10000 / n);
  const out = Array(n).fill(base);
  for (let i = 0; i < 10000 - base * n; i += 1) out[i] += 1;
  return out.map((c) => (c / 100).toString());
}

/** `spent_at` picks noon UTC so a date never shifts across time zones. */
export function isoSpentAt(day) {
  return day ? new Date(`${day}T12:00:00Z`).toISOString() : null;
}

/** UTC day, same as web `todayStr()` — keeps payloads identical. */
export function todayIso(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

/**
 * @param {object} f form state
 * @param {string} f.title
 * @param {string} f.amount        money text
 * @param {string} f.payerId
 * @param {string} f.splitType
 * @param {string[]} f.participantIds
 * @param {string} f.category
 * @param {string} f.spentAt       YYYY-MM-DD
 * @param {boolean} f.onlyPresent
 * @param {string} f.tax, f.tip, f.fee   money text, '' omits the key
 * @param {string} f.origCurrency, f.origAmount, f.fxRate
 * @param {Array<{label:string, amount:string, covered_by:string}>} f.guests
 * @param {Object<string,string>} f.values  per-participant boxes
 */
export function buildExpensePayload(f = {}) {
  const sel = Array.isArray(f.participantIds) ? f.participantIds : [];
  const values = f.values || {};
  const type = f.splitType || 'EQUAL';
  const body = {
    title: f.title,
    amount: Number(f.amount),
    payer_id: f.payerId,
    split_type: type,
    participant_ids: sel,
    category: f.category,
    spent_at: isoSpentAt(f.spentAt),
    only_present: !!f.onlyPresent,
  };
  if (f.tax !== '' && f.tax != null) body.tax = Number(f.tax);
  if (f.tip !== '' && f.tip != null) body.tip = Number(f.tip);
  if (f.fee !== '' && f.fee != null) body.fee = Number(f.fee);
  const origCurrency = String(f.origCurrency || '').trim();
  if (origCurrency !== '') {
    body.orig_currency = origCurrency.toUpperCase();
    body.orig_amount = Number(f.origAmount);
    body.fx_rate = Number(f.fxRate);
  }
  const guests = Array.isArray(f.guests) ? f.guests : [];
  if (guests.length > 0) {
    body.guests = guests.map((g) => ({
      label: g.label,
      amount_cents: Math.round(Number(g.amount || 0) * 100),
      covered_by: g.covered_by,
    }));
  }
  if (type === 'EXACT') {
    body.exact = sel.map((id) => ({ user_id: id, amount_cents: Math.round(Number(values[id] || 0) * 100) }));
  }
  if (type === 'PERCENT') {
    body.percent = sel.map((id) => ({ user_id: id, percent: Number(values[id] || 0) }));
  }
  if (type === 'SHARES') {
    // Empty box means 1 share (avoids a 0 -> 422 dead-end).
    body.shares = sel.map((id) => ({
      user_id: id,
      shares: values[id] === '' || values[id] == null ? 1 : Math.max(1, Math.round(Number(values[id] || 1))),
    }));
  }
  return body;
}

/** Local running totals for EXACT/PERCENT/SHARES inputs (server 422 stays authoritative). */
export function splitTotals(f = {}) {
  const sel = Array.isArray(f.participantIds) ? f.participantIds : [];
  const values = f.values || {};
  const type = f.splitType || 'EQUAL';
  if (type === 'EQUAL' || sel.length === 0) return null;
  const nums = sel.map((id) => Number(values[id] || 0));
  if (nums.some((n) => Number.isNaN(n))) return null;
  const sum = nums.reduce((a, b) => a + b, 0);
  if (type === 'EXACT') {
    const total = Number(f.amount || 0);
    return { kind: 'exact', sum, total, ok: Math.abs(sum - total) < 0.005 };
  }
  if (type === 'PERCENT') return { kind: 'percent', sum, ok: Math.abs(sum - 100) < 1e-9 };
  return { kind: 'shares', sum, ok: true };
}

/**
 * Client-side validation before POST: title, amount, participants, payer, and
 * the split-specific totals. Returns `{ ok, errors: {field: reason} }`.
 */
export function validateExpenseForm(f = {}) {
  const errors = {};
  const title = String(f.title || '').trim();
  if (!title || title.length > 100) errors.title = 'title';
  const amountError = moneyFieldError(f.amount);
  if (amountError) errors.amount = amountError;
  if (!f.payerId) errors.payer_id = 'required';
  const sel = Array.isArray(f.participantIds) ? f.participantIds : [];
  if (sel.length === 0) errors.participant_ids = 'required';
  const totals = splitTotals(f);
  if (totals && !totals.ok) errors.split = totals.kind;
  // Spent-on must be a real ISO day no later than tomorrow (server rejects the rest).
  const day = String(f.spentAt || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(new Date(`${day}T12:00:00Z`).getTime())) {
    errors.spentAt = 'date';
  } else if (day > todayIso(new Date(Date.now() + 24 * 60 * 60 * 1000))) {
    errors.spentAt = 'future';
  }
  if (f.origCurrency && String(f.origCurrency).trim() !== '') {
    if (moneyFieldError(f.origAmount)) errors.orig_amount = 'amount';
    const rate = Number(f.fxRate);
    if (!Number.isFinite(rate) || rate <= 0) errors.fx_rate = 'rate';
  }
  for (const [key, reason] of [['tax', moneyFieldError(f.tax)], ['tip', moneyFieldError(f.tip)], ['fee', moneyFieldError(f.fee)]]) {
    // Optional money boxes only fail when something was typed that is not a number.
    if (String(f[key] ?? '').trim() === '') continue;
    if (reason && reason !== 'required') errors[key] = reason;
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

/** PATCH body for editing an existing expense (expected_version is mandatory). */
export function buildExpensePatch(f = {}, version) {
  return { ...buildExpensePayload(f), expected_version: version };
}
