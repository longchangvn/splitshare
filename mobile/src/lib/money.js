// Money + balance rules — mirrors web/src/api.js `fmt` and web/src/balance.js.
// Plain JS (no React, no imports) so node --test can execute it directly.
//
// Repository invariants encoded here:
// - Amounts are integer minor units (cents).
// - Currencies are NEVER summed together: grouping is per currency only.

export const MAX_MONEY_AMOUNT = 1_000_000; // $1,000,000 — mirrors the API amount rule
const AMOUNT_RE = /^\d{1,7}(\.\d{1,2})?$/;

const CURRENCY_SYMBOL = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  VND: '₫',
};

/** cents → "$1,789.32" (USD) / "SEK 1,789.32" (unknown code). Same as web `fmt`. */
export function fmt(cents, currency = 'USD') {
  const code = String(currency || 'USD').toUpperCase();
  const value = Number(cents || 0) / 100;
  const amount = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
  const sym = CURRENCY_SYMBOL[code];
  return sym ? `${sym}${amount}` : `${code} ${amount}`;
}

/** Sign prefix for a money string; `fmt` never renders "+". */
export function signPrefix(cents) {
  return cents > 0 ? '+' : cents < 0 ? '-' : '';
}

/** Display tone for a signed balance: owe < 0, owed > 0, settled == 0. */
export function toneForNet(netCents) {
  return netCents < 0 ? 'owe' : netCents > 0 ? 'owed' : 'settled';
}

/** Money input → integer cents, or null when unusable. */
export function parseMoneyInput(raw) {
  const value = String(raw ?? '').trim();
  if (!AMOUNT_RE.test(value)) return null;
  const cents = Math.round(Number(value) * 100);
  return cents > 0 && cents <= MAX_MONEY_AMOUNT * 100 ? cents : null;
}

/** True when the text is a complete, acceptable amount for a form field. */
export function isValidMoney(raw) {
  return parseMoneyInput(raw) !== null;
}

/** Validate a money field with a precise reason (for inline errors). */
export function moneyFieldError(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return 'required';
  if (!AMOUNT_RE.test(value)) return 'format';
  const cents = Math.round(Number(value) * 100);
  if (cents <= 0) return 'positive';
  if (cents > MAX_MONEY_AMOUNT * 100) return 'max';
  return null;
}

/** "{n} of {total}" percent for budget/progress bars, clamped 0–100. */
export function percentOf(part, total) {
  const t = Number(total);
  if (!Number.isFinite(t) || t <= 0) return 0;
  const p = (Number(part) / t) * 100;
  return Math.max(0, Math.min(100, Math.round(p)));
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Per-currency totals for GET /me/balances groups. There is deliberately no
 * function that returns a single cross-currency number.
 * @returns {Array<{currency:string, net_cents:number, group_count:number}>}
 */
export function perCurrencyTotals(groups = []) {
  const nets = new Map();
  const counts = new Map();
  for (const g of Array.isArray(groups) ? groups : []) {
    const currency = String(g?.currency || 'USD').toUpperCase();
    nets.set(currency, (nets.get(currency) || 0) + num(g?.net_cents));
    counts.set(currency, (counts.get(currency) || 0) + 1);
  }
  return [...nets]
    .map(([currency, net_cents]) => ({ currency, net_cents, group_count: counts.get(currency) || 0 }))
    .sort((a, b) => Math.abs(b.net_cents) - Math.abs(a.net_cents) || a.currency.localeCompare(b.currency));
}

function normalizeTransfers(raw) {
  return (Array.isArray(raw) ? raw : []).map((x) => ({
    from_user_id: x.from_user_id,
    from_name: x.from_name || 'Unknown',
    to_user_id: x.to_user_id,
    to_name: x.to_name || 'Unknown',
    amount_cents: num(x.amount_cents),
    from_me: !!x.from_me,
  }));
}

/**
 * Port of web `buildBalance`: headline per currency, open groups biggest-first.
 * Prefers the API's additive `balance` block and falls back to deriving the
 * identical numbers from `groups[].net_cents`.
 */
export function buildBalance(groups = [], serverBalance = null) {
  const list = (Array.isArray(groups) ? groups : []).map((g) => ({
    group_id: g.group_id,
    name: g.name || '',
    currency: String(g.currency || 'USD').toUpperCase(),
    net_cents: num(g.net_cents),
    transfers: normalizeTransfers(g.my_transfers),
  }));

  let byCurrency;
  if (Array.isArray(serverBalance?.by_currency) && serverBalance.by_currency.length > 0) {
    byCurrency = serverBalance.by_currency.map((r) => {
      const currency = String(r.currency || 'USD').toUpperCase();
      const counted = Number(r.group_count);
      return {
        currency,
        net_cents: num(r.net_cents),
        group_count: Number.isFinite(counted) && counted > 0
          ? counted
          : list.filter((g) => g.currency === currency).length,
      };
    });
  } else {
    byCurrency = perCurrencyTotals(list);
  }
  byCurrency.sort((a, b) => Math.abs(b.net_cents) - Math.abs(a.net_cents)
    || a.currency.localeCompare(b.currency));

  const serverPrimary = serverBalance?.primary_currency
    ? String(serverBalance.primary_currency).toUpperCase()
    : null;
  const primary = byCurrency.find((c) => c.currency === serverPrimary) || byCurrency[0] || null;
  const primaryNetCents = primary ? primary.net_cents : 0;

  const open = list
    .filter((g) => g.net_cents !== 0)
    .sort((a, b) => Math.abs(b.net_cents) - Math.abs(a.net_cents) || a.name.localeCompare(b.name));

  return {
    primaryCurrency: primary ? primary.currency : null,
    primaryNetCents,
    primaryGroupCount: primary ? primary.group_count : 0,
    direction: primaryNetCents > 0 ? 'owed' : primaryNetCents < 0 ? 'owe' : 'settled',
    tone: toneForNet(primaryNetCents),
    currencyCount: byCurrency.length,
    byCurrency,
    groups: open,
    settledCount: list.filter((g) => g.net_cents === 0).length,
    totalGroups: list.length,
  };
}

/** Net of a single currency's rows — used for the per-currency balance sheet. */
export function currencyNet(groups, currency) {
  const code = String(currency || '').toUpperCase();
  return (Array.isArray(groups) ? groups : [])
    .filter((g) => String(g?.currency || 'USD').toUpperCase() === code)
    .reduce((sum, g) => sum + num(g?.net_cents), 0);
}
