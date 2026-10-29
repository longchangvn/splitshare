// Per-group owe/owed sections — port of web/src/breakdown.js.
// No cross-group and no cross-currency summing, by construction.
export function buildBreakdown(groups) {
  const build = (direction) => (Array.isArray(groups) ? groups : [])
    .map((g) => {
      const rows = direction === 'owe' ? g.owes : g.owed_to_me;
      if (!rows || rows.length === 0) return null;
      const people = rows
        .map((r) => (direction === 'owe'
          ? { user_id: r.to_user_id, name: r.to_name, amount_cents: Number(r.amount_cents) || 0 }
          : { user_id: r.from_user_id, name: r.from_name, amount_cents: Number(r.amount_cents) || 0 }))
        .sort((a, b) => b.amount_cents - a.amount_cents
          || String(a.name).localeCompare(String(b.name)));
      const total = people.reduce((sum, p) => sum + p.amount_cents, 0);
      return { group_id: g.group_id, name: g.name, currency: g.currency, people, total_cents: total };
    })
    .filter(Boolean)
    .sort((a, b) => b.total_cents - a.total_cents
      || String(a.name).localeCompare(String(b.name)));

  return { owe: build('owe'), owed: build('owed') };
}
