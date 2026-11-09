import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import test from 'node:test';

const dashboard = await readFile(new URL('../src/pages/Dashboard.jsx', import.meta.url), 'utf8');
const messages = await readFile(new URL('../src/i18n/messages.js', import.meta.url), 'utf8');
const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
const bottomNav = await readFile(new URL('../src/components/BottomNav.jsx', import.meta.url), 'utf8');

test('step 2 renders invite-by-email before the search-contacts row', () => {
  // Approved order: invite email first, search after.
  const invite = dashboard.indexOf("label={t('wizard.inviteByEmail')}");
  const search = dashboard.indexOf("label={t('wizard.searchContacts')}");
  assert.ok(invite !== -1 && search !== -1, 'expected both blocks in the wizard');
  assert.ok(invite < search, 'invite-by-email must come before search contacts');
});

test('a top-20 contacts box renders after the search block', () => {
  // The box lists the current user's contacts ordered by display name.
  assert.match(dashboard, /className="wizard-contacts-box"/);
  assert.match(dashboard, /\{t\('wizard\.yourContacts'\)\}/);
  assert.match(dashboard, /\{t\('wizard\.noContacts'\)\}/);
  const search = dashboard.indexOf("label={t('wizard.searchContacts')}");
  const box = dashboard.indexOf('className="wizard-contacts-box"');
  assert.ok(box > search, 'the contacts box belongs after the search block');
  // Loaded from the contacts endpoint (server orders by display_name) and
  // re-sorted client-side, capped at 20 by the API's limit param.
  assert.match(dashboard, /\/api\/v1\/contacts\?limit=20/);
  assert.match(dashboard, /display_name\)\.localeCompare\(String\(b\.display_name\)\)/);
});

test('search results and the contacts box share one pick/unpick row', () => {
  assert.match(dashboard, /function WizardPersonRow\(/);
  assert.equal((dashboard.match(/<WizardPersonRow /g) ?? []).length, 2);
});

test('group creation has no template field and always creates a plain group', () => {
  // Templates are out of group creation for now (product decision).
  assert.doesNotMatch(dashboard, /wizard\.template/);
  assert.doesNotMatch(dashboard, /api\.post\('\/api\/v1\/groups\/from-template'/);
  assert.match(dashboard, /api\.post\('\/api\/v1\/groups', \{/);
});

test('template catalog and Settings page are removed; /settings redirects to profile', () => {
  for (const f of ['../src/pages/Settings.jsx', '../src/settingsStore.js', '../src/wizardUtils.js']) {
    assert.equal(existsSync(new URL(f, import.meta.url)), false, `${f} should be deleted`);
  }
  assert.match(app, /path="\/settings" element=\{<Navigate to="\/profile" replace \/>\}/);
  assert.doesNotMatch(bottomNav, /'\/settings'|id: 'settings'/);
  assert.doesNotMatch(messages, /'wizard\.template'|'settings\.\w*[Tt]emplate\w*'/);
});

test('wizard strings exist in both the English and Vietnamese message maps', () => {
  const keys = ['wizard.yourContacts', 'wizard.noContacts'];
  const [enSource, viSource] = messages.split(/const vi = \{/);
  assert.ok(enSource && viSource, 'expected both en and vi maps in messages.js');
  for (const key of keys) {
    const entry = new RegExp(`'${key.replace(/\./g, '\\.')}':`);
    assert.match(enSource, entry);
    assert.match(viSource, entry);
  }
});
