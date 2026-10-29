// Money input rules — same as web/src/components/Forms.jsx (sanitizeMoneyInput,
// isValidMoneyAmount, moneyAmountError, equalPercent). Kept in sync by hand because the
// web versions live inside a JSX component module.
import { normalizeDecimalInput } from './shared/decimalInput.js';

export const MAX_MONEY_AMOUNT = 1_000_000;

/** Keep only digits + one `.`, max 7 integer and 2 decimal places. */
export function sanitizeMoneyInput(raw) {
  let s = normalizeDecimalInput(raw).replace(/[^\d.]/g, '');
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

/** Equal-percent distribution summing to exactly 100.00 (server largest-remainder). */
export function equalPercent(n) {
  if (!n) return [];
  const base = Math.floor(10000 / n);
  const out = Array(n).fill(base);
  for (let i = 0; i < 10000 - base * n; i++) out[i] += 1;
  return out.map((c) => (c / 100).toString());
}
