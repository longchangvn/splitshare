// AUTO-COPIED from web/src/receiptBatch.js by mobile/scripts/sync-shared.js — do not edit here.
// Edit the web file, then run `npm run sync:shared` in mobile/.
// Pure helpers for scanning several receipts at once (specs/004 Phase 2, specs/007).
// A card = batch metadata (status, file, Idempotency-Key…) + the shared expense draft
// (expenseDraft.js), so a card validates and saves exactly like the Add expense form.
// All card state stays plain JSON so it can be unit-tested outside React.
import {
  applyScan, blankDraft, draftToBody, effectiveAmount, moneyToCents, todayIso, validateDraft,
} from './expenseDraft.js';

export { moneyToCents, todayIso };

export const MAX_BATCH = 10;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

function uid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Amount of a card in the group currency: FX rate applied when the receipt is foreign. */
export const cardAmount = (card) => effectiveAmount(card);

/** Card produced when a photo is picked; the scan result fills it in afterwards. */
export function newCard(file, now = new Date()) {
  return {
    ...blankDraft(now),
    id: uid(),
    key: uid(), // Idempotency-Key, fixed for the card's lifetime
    file,
    name: file?.name || 'receipt.jpg',
    status: 'scanning',
    error: null,
    lowConfidence: false,
    warnings: [],
    receiptCurrency: '',
    expenseId: null,
  };
}

function isoDay(raw) {
  const value = String(raw ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function fallbackTitle(name) {
  const stem = String(name || '').replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
  return stem ? stem.slice(0, 100) : 'Receipt';
}

/**
 * Receipt entries of a scan response. A photo can hold several receipts, so the API
 * returns `receipts: [...]`; older/lean responses carry a single `receipt` or flat fields.
 */
export function receiptsFromResponse(resp) {
  if (Array.isArray(resp?.receipts) && resp.receipts.length > 0) {
    return resp.receipts.filter((r) => r && typeof r === 'object');
  }
  if (resp?.receipt && typeof resp.receipt === 'object') return [resp.receipt];
  return resp && typeof resp === 'object' ? [resp] : [];
}

/**
 * Merge one receipt entry of a `POST /groups/{id}/expenses/scan` response into a card
 * (shared `applyScan`: amount = grand total, tax/tip left empty, FX trio when foreign).
 */
export function cardFromSuggestion(card, resp, group = {}) {
  const { patch, scan } = applyScan(card, resp, group);
  return {
    ...card,
    ...patch,
    status: scan.hasTotal ? 'ready' : 'manual',
    title: patch.title || card.title || fallbackTitle(card.name),
    lowConfidence: scan.lowConfidence,
    warnings: scan.warnings,
    receiptCurrency: scan.receiptCurrency,
    error: null,
  };
}

/**
 * Cards for every receipt found in one photo. The first keeps the scan card's id/key;
 * extra receipts are clones with their own id and Idempotency-Key. Same photo file on all.
 */
export function cardsFromSuggestion(card, resp, group = {}) {
  const receipts = receiptsFromResponse(resp);
  if (receipts.length === 0) return [cardFromSuggestion(card, resp, group)];
  return receipts.map((receipt, index) => {
    const seed = index === 0
      ? card
      : { ...card, id: uid(), key: uid(), fieldErrors: [] };
    return cardFromSuggestion(seed, { ...resp, receipt }, group);
  });
}

/** Field-level error codes for the review card (shared `validateDraft`); empty = ready. */
export const validateCard = (card, members = []) => validateDraft(card, members);

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

/** Request body for `POST /groups/{id}/expenses` — the same builder as the Add expense form. */
export function buildExpensePayload(card, members = []) {
  const participantIds = (card.participantIds || []).length > 0
    ? card.participantIds
    : members.map((m) => m.user_id);
  return draftToBody({ ...card, participantIds });
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
