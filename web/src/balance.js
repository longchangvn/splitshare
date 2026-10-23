/**
 * Netted "My balance" for the dashboard: one total balance across all groups,
 * netted **per currency only** — currencies are never summed together (repo
 * invariant). GET /api/v1/me/balances does the same netting server-side and
 * returns it as `balance`; this module prefers that block and falls back to
 * deriving the identical numbers from `groups[].net_cents` so the card still
 * works against an older API build or a cached payload.
 *
 * Each group also carries `my_transfers[]` — the settlement optimizer's
 * fewest-transfer plan for the groups I am in (raw pairwise debts live in
 * `owes[]`/`owed_to_me[]` and are a different, intentionally un-netted view).
 *
 * Plain JS (no JSX, no imports) so it can be executed directly by node --test.
 */

/** Display/sign tone for a signed balance: owe < 0, owed > 0, settled == 0. */
export function toneForNet(netCents) {
  return netCents < 0 ? 'open' : netCents > 0 ? 'owed' : 'settled';
}

/**
 * Sign prefix for a money string. `fmt` renders its own "-" (never "+"), so
 * callers compose: `${signPrefix(n)}${fmt(Math.abs(n), currency)}`.
 */
export function signPrefix(cents) {
  return cents > 0 ? '+' : cents < 0 ? '-' : '';
}

function normalizeTransfers(raw) {
  return (Array.isArray(raw) ? raw : []).map((x) => ({
    from_user_id: x.from_user_id,
    from_name: x.from_name || 'Unknown',
    to_user_id: x.to_user_id,
    to_name: x.to_name || 'Unknown',
    amount_cents: Number(x.amount_cents) || 0,
    from_me: !!x.from_me,
  }));
}

/**
 * @param {Array} groups  `groups[]` rows from GET /api/v1/me/balances.
 * @param {Object|null} serverBalance  the additive `balance` block, if present.
 * @returns {{
 *   primaryCurrency: string|null, primaryNetCents: number, primaryGroupCount: number,
 *   direction: 'owe'|'owed'|'settled', tone: string, currencyCount: number,
 *   byCurrency: Array<{currency:string, net_cents:number, group_count:number}>,
 *   groups: Array<{group_id:string, name:string, currency:string, net_cents:number,
 *                  transfers:Array<{from_user_id:string, from_name:string,
 *                    to_user_id:string, to_name:string, amount_cents:number, from_me:boolean}>}>
 * }}
 */
export function buildBalance(groups = [], serverBalance = null) {
  const list = (Array.isArray(groups) ? groups : []).map((g) => ({
    group_id: g.group_id,
    name: g.name || '',
    currency: String(g.currency || 'USD').toUpperCase(),
    net_cents: Number(g.net_cents) || 0,
    transfers: normalizeTransfers(g.my_transfers),
  }));

  const groupCounts = new Map();
  for (const g of list) groupCounts.set(g.currency, (groupCounts.get(g.currency) || 0) + 1);

  let byCurrency;
  if (Array.isArray(serverBalance?.by_currency) && serverBalance.by_currency.length > 0) {
    // Server-side netting wins; only fill gaps it does not carry.
    byCurrency = serverBalance.by_currency.map((r) => {
      const currency = String(r.currency || 'USD').toUpperCase();
      const counted = Number(r.group_count);
      return {
        currency,
        net_cents: Number(r.net_cents) || 0,
        group_count: Number.isFinite(counted) && counted > 0
          ? counted
          : (groupCounts.get(currency) || 0),
      };
    });
  } else {
    const nets = new Map();
    for (const g of list) nets.set(g.currency, (nets.get(g.currency) || 0) + g.net_cents);
    byCurrency = [...nets].map(([currency, net_cents]) => ({
      currency,
      net_cents,
      group_count: groupCounts.get(currency) || 0,
    }));
  }

  // Largest absolute position first; ties break on the currency code so the
  // headline figure is deterministic for both payload paths.
  byCurrency.sort((a, b) => Math.abs(b.net_cents) - Math.abs(a.net_cents)
    || a.currency.localeCompare(b.currency));

  const serverPrimary = serverBalance?.primary_currency
    ? String(serverBalance.primary_currency).toUpperCase()
    : null;
  const primary = byCurrency.find((c) => c.currency === serverPrimary) || byCurrency[0] || null;
  const primaryNetCents = primary ? primary.net_cents : 0;
  const direction = primaryNetCents > 0 ? 'owed' : primaryNetCents < 0 ? 'owe' : 'settled';

  // Panel rows: only groups with an open position, biggest swing first.
  const open = list.filter((g) => g.net_cents !== 0)
    .sort((a, b) => Math.abs(b.net_cents) - Math.abs(a.net_cents)
      || a.name.localeCompare(b.name));

  return {
    primaryCurrency: primary ? primary.currency : null,
    primaryNetCents,
    primaryGroupCount: primary ? primary.group_count : 0,
    direction,
    tone: toneForNet(primaryNetCents),
    currencyCount: byCurrency.length,
    byCurrency,
    groups: open,
  };
}
