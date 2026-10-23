import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildBreakdown } from '../src/breakdown.js';

const dashboard = await readFile(new URL('../src/pages/Dashboard.jsx', import.meta.url), 'utf8');
const messages = await readFile(new URL('../src/i18n/messages.js', import.meta.url), 'utf8');
const breakdownSrc = await readFile(new URL('../src/breakdown.js', import.meta.url), 'utf8');

test('owe and owed stat cards are buttons exposing aria-expanded', () => {
  // Both cards become interactive disclosure buttons.
  assert.match(dashboard, /dash-stat-btn dash-owe is-clickable/);
  assert.match(dashboard, /dash-stat-btn dash-owed is-clickable/);
  assert.match(dashboard, /aria-expanded=\{openPanel === 'owe'\}/);
  assert.match(dashboard, /aria-expanded=\{openPanel === 'owed'\}/);
  assert.match(dashboard, /aria-controls="dash-breakdown"/);
  assert.match(dashboard, /<button\s+type="button"\s*\n\s*className=\{`dash-card dash-stat dash-stat-btn/);
});

test('clicking a card toggles the inline breakdown panel', () => {
  assert.match(dashboard, /useState\(null\)/); // openPanel state
  assert.match(dashboard, /setOpenPanel\(openPanel === 'owe' \? null : 'owe'\)/);
  assert.match(dashboard, /setOpenPanel\(openPanel === 'owed' \? null : 'owed'\)/);
  assert.match(dashboard, /className="dash-card dash-breakdown"/);
});

test('breakdown groups raw owes/owed rows per group with group header links', () => {
  // Consumes the additive owes[]/owed_to_me[] payload fields (in ./breakdown.js).
  assert.match(breakdownSrc, /\.owes\b/);
  assert.match(breakdownSrc, /\.owed_to_me\b/);
  // Person rows render name and per-group amount; the section header links out.
  assert.match(dashboard, /className="dash-person-row"/);
  assert.match(dashboard, /className="dash-group-link"/);
  assert.match(dashboard, /to=\{`\/groups\/\$\{.*\}`\}/);
  // Sections are per group and never summed across groups.
  assert.match(dashboard, /dashboard\.perGroupNote/);
});

// --- Executable coverage: runs buildBreakdown against a real API payload. ---

// Exact shape from GET /api/v1/me/balances (snake_case contract, spec §9).
const LIVE_PAYLOAD = {
  groups: [
    {
      group_id: 'e303c071-3bd1-4331-89e3-d448a4b962b8',
      name: 'Road Trip Las Vegas',
      currency: 'USD',
      net_cents: 67468,
      owes: [],
      owed_to_me: [
        { from_user_id: '68a084a0', from_name: 'User Three', amount_cents: 25067 },
        { from_user_id: '13200e8f', from_name: 'User Four', amount_cents: 24968 },
        { from_user_id: 'b1bf7c96', from_name: 'User Two', amount_cents: 13132 },
        { from_user_id: 'ee7a88f0', from_name: 'User Five', amount_cents: 4301 },
      ],
    },
  ],
  totals: { USD: { owe_cents: 0, owed_cents: 67468 } },
};

test('buildBreakdown executes on the live balances payload without throwing', () => {
  // Regression: a free identifier (amount_cents vs amountCents) once threw a
  // ReferenceError on the first non-empty owes/owed_to_me row, blanking the panel.
  assert.doesNotThrow(() => buildBreakdown(LIVE_PAYLOAD.groups));
});

test('owed panel lists every debtor in the group, sorted descending', () => {
  const { owe, owed } = buildBreakdown(LIVE_PAYLOAD.groups);
  assert.equal(owe.length, 0); // owes: [] -> empty owe panel
  assert.equal(owed.length, 1);
  const [trip] = owed;
  assert.equal(trip.group_id, 'e303c071-3bd1-4331-89e3-d448a4b962b8');
  assert.equal(trip.name, 'Road Trip Las Vegas');
  assert.equal(trip.currency, 'USD');
  const names = trip.people.map((p) => p.name);
  assert.deepEqual(names, ['User Three', 'User Four', 'User Two', 'User Five']);
  assert.deepEqual(trip.people.map((p) => p.amount_cents), [25067, 24968, 13132, 4301]);
  // Rows sum to the section total and to the API's headline for this
  // single-group payload.
  const sum = trip.people.reduce((s, p) => s + p.amount_cents, 0);
  assert.equal(sum, trip.total_cents);
  assert.equal(sum, LIVE_PAYLOAD.totals.USD.owed_cents);
});

test('buildBreakdown never sums across groups', () => {
  // Ana owes me 2000 in Trip; I owe her 500 in Dinner -> two independent
  // per-group sections, no cross-group netting into a single row.
  const groups = [
    { group_id: 'g1', name: 'Trip', currency: 'USD', owes: [], owed_to_me: [{ from_user_id: 'u1', from_name: 'Ana', amount_cents: 2000 }] },
    { group_id: 'g2', name: 'Dinner', currency: 'USD', owes: [{ to_user_id: 'u1', to_name: 'Ana', amount_cents: 500 }], owed_to_me: [] },
  ];
  const { owe, owed } = buildBreakdown(groups);
  // One section per group; Ana appears once per group at her raw group amount.
  assert.equal(owed.length, 1);
  assert.equal(owed[0].group_id, 'g1');
  assert.deepEqual(owed[0].people.map((p) => [p.name, p.amount_cents]), [['Ana', 2000]]);
  assert.equal(owe.length, 1);
  assert.equal(owe[0].group_id, 'g2');
  assert.deepEqual(owe[0].people.map((p) => [p.name, p.amount_cents]), [['Ana', 500]]);
});

test('buildBreakdown never sums across currencies', () => {
  const groups = [
    { group_id: 'g1', name: 'US', currency: 'USD', owed_to_me: [{ from_user_id: 'u1', from_name: 'Ana', amount_cents: 1000 }] },
    { group_id: 'g2', name: 'EU', currency: 'EUR', owed_to_me: [{ from_user_id: 'u2', from_name: 'Bo', amount_cents: 2000 }] },
  ];
  const { owed } = buildBreakdown(groups);
  // Separate group sections, each carrying its own currency — never merged.
  // Sorted by section total descending (EUR 2000 before USD 1000).
  assert.equal(owed.length, 2);
  assert.deepEqual(owed.map((s) => [s.group_id, s.currency]), [['g2', 'EUR'], ['g1', 'USD']]);
});

test('breakdown renders per-group sections with the never-summed note', () => {
  // One section per group, headed by a link to the group plus its currency.
  assert.match(dashboard, /className="dash-breakdown-section"/);
  assert.match(dashboard, /className="dash-breakdown-group"/);
  assert.match(dashboard, /className="dash-group-link"/);
  assert.match(dashboard, /className="dash-breakdown-currency"/);
  // The footnote reinforces the never-summed-across-groups invariant.
  assert.match(dashboard, /\{t\('dashboard\.perGroupNote'\)\}/);
});

test('each breakdown panel renders directly after the card that opens it', () => {
  // DOM order (drives mobile single-column flow): owe card -> owe panel ->
  // owed card -> owed panel, so a panel is never stranded below the other card.
  const oweCard = dashboard.indexOf("setOpenPanel(openPanel === 'owe' ? null : 'owe')");
  const owePanel = dashboard.indexOf("{openPanel === 'owe' && (");
  const owedCard = dashboard.indexOf("setOpenPanel(openPanel === 'owed' ? null : 'owed')");
  const owedPanel = dashboard.indexOf("{openPanel === 'owed' && (");
  assert.ok(oweCard !== -1 && owePanel !== -1 && owedCard !== -1 && owedPanel !== -1);
  assert.ok(oweCard < owePanel && owePanel < owedCard, 'owe panel belongs between the two cards');
  assert.ok(owedCard < owedPanel, 'owed panel belongs right after the owed card');
  // Exactly one panel of each kind condition is rendered.
  assert.equal((dashboard.match(/\{openPanel === 'owe' && \(/g) ?? []).length, 1);
  assert.equal((dashboard.match(/\{openPanel === 'owed' && \(/g) ?? []).length, 1);
});

test('breakdown panel is wired to its cards and collapses via onClose', () => {
  // The panel element is addressable by both cards.
  assert.match(dashboard, /<section id="dash-breakdown"/);
  assert.equal((dashboard.match(/aria-controls="dash-breakdown"/g) ?? []).length, 2);
  assert.match(dashboard, /aria-expanded=\{openPanel === 'owe'\}/);
  assert.match(dashboard, /aria-expanded=\{openPanel === 'owed'\}/);
  // The close button hands control back to the toggling card.
  assert.match(dashboard, /className="dash-breakdown-close" onClick=\{onClose\}/);
  assert.match(dashboard, /t\('dashboard\.collapseBreakdown'\)/);
});

test('breakdown strings exist in both the English and Vietnamese message maps', () => {
  const keys = [
    'dashboard.collapseBreakdown',
    'dashboard.breakdownEmptyOwe',
    'dashboard.breakdownEmptyOwed',
    'dashboard.perGroupNote',
  ];
  // Split the source so each key must be present in the en map AND the vi map.
  const [enSource, viSource] = messages.split(/const vi = \{/);
  assert.ok(enSource && viSource, 'expected both en and vi maps in messages.js');
  for (const key of keys) {
    const entry = new RegExp(`'${key.replace(/\./g, '\\.')}':`);
    assert.match(enSource, entry);
    assert.match(viSource, entry);
  }
});
