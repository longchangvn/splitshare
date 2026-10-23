import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const dashboard = await readFile(new URL('../src/pages/Dashboard.jsx', import.meta.url), 'utf8');
const messages = await readFile(new URL('../src/i18n/messages.js', import.meta.url), 'utf8');

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

test('breakdown aggregates raw owes/owed per person per currency with group links', () => {
  // Consumes the additive owes[]/owed_to_me[] payload fields.
  assert.match(dashboard, /\.owes\b/);
  assert.match(dashboard, /\.owed_to_me\b/);
  // Person rows render name, per-currency amount, and per-group links.
  assert.match(dashboard, /className="dash-person-row"/);
  assert.match(dashboard, /to=\{`\/groups\/\$\{.*\}`\}/);
  // Sections are per currency and never summed across currencies.
  assert.match(dashboard, /dashboard\.perCurrencyNote/);
});

test('breakdown renders per-currency sections with the never-summed note', () => {
  // One section per currency, each headed by the currency code.
  assert.match(dashboard, /className="dash-breakdown-section"/);
  assert.match(dashboard, /className="dash-breakdown-currency"/);
  // The footnote reinforces the never-summed-across-currencies invariant.
  assert.match(dashboard, /\{t\('dashboard\.perCurrencyNote'\)\}/);
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
    'dashboard.perCurrencyNote',
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
