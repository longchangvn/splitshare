import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { resolveTemplateKey } from '../src/wizardUtils.js';

const dashboard = await readFile(new URL('../src/pages/Dashboard.jsx', import.meta.url), 'utf8');
const messages = await readFile(new URL('../src/i18n/messages.js', import.meta.url), 'utf8');

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

test('template field is a free-input combobox offering a None option', () => {
  assert.match(dashboard, /<Autocomplete\s+label=\{t\('wizard\.template'\)\}/);
  // Suggestions: localized "None" first, then catalog labels (free text allowed).
  assert.match(dashboard, /\[t\('common\.none'\), \.\.\.templates\.map\(/);
  // The chosen value is resolved to a key before hitting the API.
  assert.match(dashboard, /import \{ resolveTemplateKey \} from '\.\.\/wizardUtils\.js'/);
  assert.match(dashboard, /resolveTemplateKey\(templates, tpl, t\('common\.none'\)\)/);
  assert.match(dashboard, /template: tplKey/);
});

// --- Executable coverage for the template-value resolution. ---

const TEMPLATES = [
  { key: 'roommates', label: 'Roommates' },
  { key: 'beach-trip', label: 'Beach trip' },
];

test('resolveTemplateKey maps catalog labels to their keys', () => {
  assert.equal(resolveTemplateKey(TEMPLATES, 'Beach trip', 'None'), 'beach-trip');
  assert.equal(resolveTemplateKey(TEMPLATES, '  Roommates ', 'None'), 'roommates');
});

test('resolveTemplateKey treats None and empty as no template', () => {
  assert.equal(resolveTemplateKey(TEMPLATES, 'None', 'None'), '');
  assert.equal(resolveTemplateKey(TEMPLATES, '', 'None'), '');
  assert.equal(resolveTemplateKey(TEMPLATES, '   ', 'None'), '');
  assert.equal(resolveTemplateKey(TEMPLATES, null, 'None'), '');
  // Localized None (e.g. Vietnamese "Không") also resolves to no template.
  assert.equal(resolveTemplateKey(TEMPLATES, 'Không', 'Không'), '');
});

test('resolveTemplateKey passes unknown free text through untouched', () => {
  // The API no longer validates template keys; custom names create plain groups.
  assert.equal(resolveTemplateKey(TEMPLATES, 'Ski trip', 'None'), 'Ski trip');
  assert.equal(resolveTemplateKey([], 'Whatever', 'None'), 'Whatever');
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
