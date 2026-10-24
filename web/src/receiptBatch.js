// Pure helpers for scanning several receipts at once (specs/004, Phase 2).
// All card state stays plain JSON so it can be unit-tested outside React.

export const MAX_BATCH = 10;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_AMOUNT_CENTS = 100_000_000; // $1,000,000 — mirrors the API amount rule
const AMOUNT_RE = /^\d{1,7}(\.\d{1,2})?$/;

function uid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function todayIso(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

/** Parse a money string ("12.50") to integer cents; null when unusable. */
export function moneyToCents(raw) {
  const value = String(raw ?? '').trim();
  if (!AMOUNT_RE.test(value)) return null;
  const cents = Math.round(Number(value) * 100);
  return cents > 0 && cents <= MAX_AMOUNT_CENTS ? cents : null;
}

/** Amount of a card in the group currency: FX rate applied when the receipt is foreign. */
export function cardAmount(card) {
  if (!card) return null;
  if (card.origCurrency) {
    const foreign = moneyToCents(card.origAmount);
    const rate = Number(card.fxRate);
    if (foreign === null || !Number.isFinite(rate) || rate <= 0) return null;
    const cents = Math.round(foreign * rate);
    return cents > 0 && cents <= MAX_AMOUNT_CENTS ? (cents / 100).toFixed(2) : null;
  }
  const cents = moneyToCents(card.amount);
  return cents === null ? null : (cents / 100).toFixed(2);
}

/** Card produced when a photo is picked; the scan result fills it in afterwards. */
export function newCard(file, now = new Date()) {
  return {
    id: uid(),
    key: uid(), // Idempotency-Key, fixed for the card's lifetime
    file,
    name: file?.name || 'receipt.jpg',
    status: 'scanning',
    error: null,
    title: '',
    amount: '',
    spentAt: todayIso(now),
    category: '',
    tax: '',
    tip: '',
    payerId: '',
    participantIds: [],
    lowConfidence: false,
    warnings: [],
    receiptCurrency: '',
    origCurrency: '',
    origAmount: '',
    fxRate: '',
    expenseId: null,
  };
}

function isoDay(raw) {
  const value = String(raw ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function extra(raw) {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n.toFixed(2) : '';
}

function categoryKeys(group) {
  const list = Array.isArray(group?.categories) ? group.categories : [];
  return list.map((c) => String(typeof c === 'string' ? c : c?.key || '').toLowerCase()).filter(Boolean);
}

function fallbackTitle(name) {
  const stem = String(name || '').replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
  return stem ? stem.slice(0, 100) : 'Receipt';
}

/**
 * Merge a `POST /groups/{id}/expenses/scan` response into a card. The API is
 * additive: `receipt` carries batch fields, the flat total/confidence/warnings
 * keep the old single-scan client working.
 */
export function cardFromSuggestion(card, resp, group = {}) {
  const receipt = resp?.receipt && typeof resp.receipt === 'object' ? resp.receipt : {};
  const rawTotal = receipt.total ?? resp?.total ?? null;
  const total = Number(rawTotal);
  const hasTotal = rawTotal != null && Number.isFinite(total) && total > 0 && total <= MAX_AMOUNT_CENTS / 100;
  const confidence = receipt.confidence?.total ?? resp?.confidence ?? null;
  const warnings = [...new Set([
    ...(Array.isArray(resp?.warnings) ? resp.warnings : []),
    ...(Array.isArray(receipt.warnings) ? receipt.warnings : []),
  ])];
  const merchant = typeof receipt.merchant === 'string' ? receipt.merchant.trim() : '';
  const receiptCurrency = typeof receipt.currency === 'string' ? receipt.currency.trim().toUpperCase() : '';
  const groupCurrency = String(group?.currency || '').trim().toUpperCase();
  const mismatch = !!receiptCurrency && !!groupCurrency && receiptCurrency !== groupCurrency;
  const keys = categoryKeys(group);
  const scannedCategory = String(receipt.category || '').trim().toLowerCase();
  const category = keys.length === 0 || keys.includes(scannedCategory) ? scannedCategory : '';

  return {
    ...card,
    status: hasTotal || (mismatch && receipt.total != null) ? 'ready' : 'manual',
    title: merchant.slice(0, 100) || card.title || fallbackTitle(card.name),
    amount: hasTotal && !mismatch ? total.toFixed(2) : '',
    spentAt: isoDay(receipt.date) || card.spentAt,
    category: category || card.category,
    tax: extra(receipt.tax) || card.tax,
    tip: extra(receipt.tip) || card.tip,
    lowConfidence: confidence === 'low' || !hasTotal,
    warnings,
    receiptCurrency: mismatch ? receiptCurrency : '',
    origCurrency: mismatch ? receiptCurrency : '',
    origAmount: mismatch && hasTotal ? total.toFixed(2) : '',
    fxRate: mismatch ? '' : card.fxRate,
    error: null,
  };
}

/** Field-level error codes for the review card; empty means ready to create. */
export function validateCard(card, members = []) {
  const errors = [];
  const memberIds = members.map((m) => m.user_id);
  if (!String(card?.title || '').trim() || String(card.title).trim().length > 100) errors.push('title');
  if (cardAmount(card) === null) errors.push('amount');
  if (card?.origCurrency && !(Number(card.fxRate) > 0)) errors.push('rate');
  const day = isoDay(card?.spentAt);
  if (!day || day > todayIso(new Date(Date.now() + 24 * 60 * 60 * 1000))) errors.push('date');
  if (!card?.payerId || (memberIds.length > 0 && !memberIds.includes(card.payerId))) errors.push('payer');
  const participants = card?.participantIds || [];
  if (participants.length === 0 || participants.some((id) => memberIds.length > 0 && !memberIds.includes(id))) {
    errors.push('participants');
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Ids of cards whose amount and day match an expense already in the group.
 * Ledger rows expose `amount_cents` + `created_at`; expense details add `spent_at`.
 */
export function findDuplicates(cards = [], expenses = []) {
  const seen = new Set();
  for (const e of expenses) {
    if (!e || e.kind === 'payment' || e.reversed) continue;
    const cents = Number(e.amount_cents ?? e.total_cents);
    const day = String(e.spent_at || e.created_at || '').slice(0, 10);
    if (Number.isFinite(cents) && cents > 0 && isoDay(day)) seen.add(`${cents}:${day}`);
  }
  const hits = [];
  for (const card of cards) {
    const cents = moneyToCents(cardAmount(card));
    if (cents === null) continue;
    const day = isoDay(card.spentAt);
    if (day && seen.has(`${cents}:${day}`)) hits.push(card.id);
  }
  return hits;
}

/** Request body for `POST /groups/{id}/expenses` (EQUAL split, like the batch UI). */
export function buildExpensePayload(card, members = []) {
  const participants = (card.participantIds || []).length > 0
    ? card.participantIds
    : members.map((m) => m.user_id);
  const body = {
    title: String(card.title || '').trim(),
    amount: Number(cardAmount(card)),
    payer_id: card.payerId,
    split_type: 'EQUAL',
    participant_ids: participants,
    category: card.category || null,
    spent_at: new Date(`${card.spentAt}T12:00:00Z`).toISOString(),
    only_present: false,
  };
  if (card.tax !== '' && Number(card.tax) > 0) body.tax = Number(card.tax);
  if (card.tip !== '' && Number(card.tip) > 0) body.tip = Number(card.tip);
  if (card.origCurrency && Number(card.fxRate) > 0) {
    body.orig_currency = card.origCurrency;
    body.orig_amount = Number(card.origAmount);
    body.fx_rate = Number(card.fxRate);
  }
  return body;
}

/** Run `fn` over `items` with at most `limit` in flight; results keep input order. */
export async function runPool(items, limit, fn) {
  const list = Array.from(items || []);
  const results = new Array(list.length);
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const index = next++;
      try {
        results[index] = { status: 'fulfilled', value: await fn(list[index], index) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  };
  const size = Math.max(1, Math.min(Number(limit) || 1, list.length));
  await Promise.all(Array.from({ length: size }, worker));
  return results;
}
