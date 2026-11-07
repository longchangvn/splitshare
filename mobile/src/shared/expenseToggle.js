// AUTO-COPIED from web/src/expenseToggle.js by mobile/scripts/sync-shared.js — do not edit here.
// Edit the web file, then run `npm run sync:shared` in mobile/.
/**
 * Enable/disable expenses + raw (un-optimized) debts, shared by web and mobile.
 *
 * A disabled expense (`excluded: true`, persisted via
 * PATCH /api/v1/expenses/{id}/excluded) stays in the ledger list but the API
 * leaves it out of balances, settlement and totals — so the client totals must
 * skip it too.
 *
 * `raw_debts[]` on GET /api/v1/groups/{id}/settlement is every split share owed to
 * its payer, accumulated and netted only within each pair of people (payments
 * shrink the pair) — the "before optimization" view next to the fewest-transfer plan.
 *
 * Plain JS (no JSX, no imports) so it can be executed directly by node --test.
 */

/** Ledger footer totals over loaded rows; disabled expenses do not count. */
export function ledgerTotals(items = []) {
  let amount = 0;
  let mine = 0;
  let excluded = 0;
  for (const it of Array.isArray(items) ? items : []) {
    if (it?.excluded) { excluded += 1; continue; }
    amount += Number(it?.amount_cents) || 0;
    mine += Number(it?.my_share_cents) || 0;
  }
  return { amount, mine, excluded };
}

/** The toggle is offered only on OPEN expenses (locked history cannot change). */
export function canToggleExpense(item) {
  return !!item && item.kind === 'expense' && String(item.status || '').toUpperCase() !== 'LOCKED';
}

/**
 * Groups raw pairwise debts by debtor, biggest total first.
 * @param {Array<{from_user_id:string, from_name?:string, to_user_id:string, to_name?:string, amount_cents:number}>} rows
 * @returns {Array<{from_user_id:string, from_name:string, total_cents:number,
 *   items:Array<{to_user_id:string, to_name:string, amount_cents:number}>}>}
 */
export function groupRawDebts(rows = []) {
  const byFrom = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    const cents = Number(r?.amount_cents) || 0;
    if (!r?.from_user_id || !r?.to_user_id || cents <= 0) continue;
    if (!byFrom.has(r.from_user_id)) {
      byFrom.set(r.from_user_id, {
        from_user_id: r.from_user_id, from_name: r.from_name || '', total_cents: 0, items: [],
      });
    }
    const g = byFrom.get(r.from_user_id);
    g.total_cents += cents;
    g.items.push({ to_user_id: r.to_user_id, to_name: r.to_name || '', amount_cents: cents });
  }
  const out = [...byFrom.values()];
  for (const g of out) g.items.sort((a, b) => b.amount_cents - a.amount_cents);
  return out.sort((a, b) => b.total_cents - a.total_cents || a.from_name.localeCompare(b.from_name));
}
