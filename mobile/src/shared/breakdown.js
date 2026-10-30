// AUTO-COPIED from web/src/breakdown.js by mobile/scripts/sync-shared.js — do not edit here.
// Edit the web file, then run `npm run sync:shared` in mobile/.
/**
 * Group the raw per-group owes[]/owed_to_me[] rows into per-group sections.
 *
 * Approved semantics: NO cross-group summing — each group with rows in the
 * given direction becomes its own section, and a person appears once per
 * section (the API already nets each person within a group via the raw pair
 * netting in GET /api/v1/me/balances, so no client netting is needed at all).
 * A person who owes me in one group and is owed by me in another shows up
 * once in each group's section, never as a combined row.
 *
 * Never summed across currencies either — each section carries its group's
 * single currency, so amounts from different sections are never combined.
 *
 * Plain JS (no JSX) so it can be executed directly by node --test.
 */
export function buildBreakdown(groups) {
  const build = (direction) => groups
    .map((g) => {
      const rows = direction === 'owe' ? g.owes : g.owed_to_me;
      if (!rows || rows.length === 0) return null;
      const people = rows
        .map((r) => (direction === 'owe'
          ? { user_id: r.to_user_id, name: r.to_name, amount_cents: r.amount_cents }
          : { user_id: r.from_user_id, name: r.from_name, amount_cents: r.amount_cents }))
        .sort((a, b) => b.amount_cents - a.amount_cents
          || String(a.name).localeCompare(String(b.name)));
      const total = people.reduce((s, p) => s + p.amount_cents, 0);
      return { group_id: g.group_id, name: g.name, currency: g.currency, people, total_cents: total };
    })
    .filter(Boolean)
    .sort((a, b) => b.total_cents - a.total_cents
      || String(a.name).localeCompare(String(b.name)));

  return { owe: build('owe'), owed: build('owed') };
}
