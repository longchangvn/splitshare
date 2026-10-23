import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// Archive change: settled (LOCKED) entries are presented as an archive.
// Default ledger scope = OPEN (Active); LOCKED reachable via Archived scope.

const groupDetail = await readFile(new URL('../src/pages/GroupDetail.jsx', import.meta.url), 'utf8');
const expenseDetail = await readFile(new URL('../src/pages/ExpenseDetail.jsx', import.meta.url), 'utf8');
const messagesSrc = await readFile(new URL('../src/i18n/messages.js', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
const { MESSAGES } = await import('../src/i18n/messages.js');

const MOBILE_GROUP = await readFile(
  new URL('../../mobile/src/screens/GroupScreen.js', import.meta.url), 'utf8');
const MOBILE_EXPENSE = await readFile(
  new URL('../../mobile/src/screens/ExpenseDetailScreen.js', import.meta.url), 'utf8');

test('web ledger defaults to the active (OPEN) scope', () => {
  assert.match(groupDetail, /const \[fStatus, setFStatus\] = useState\('OPEN'\)/);
  // Default filter counts toward the indicator only when it leaves the default scope.
  assert.match(groupDetail, /\(fStatus && fStatus !== 'OPEN' \? 1 : 0\)/);
});

test('web always sends status with the ledger query (search is scope-scoped)', () => {
  const qLine = /const params = new URLSearchParams\(\{ type, q, limit: '100' \}\)/;
  assert.match(groupDetail, qLine);
  assert.match(groupDetail, /params\.set\('status', st\)/);
  // Status select is deterministic: clearing falls back to OPEN, never to "all".
  assert.match(groupDetail, /onChange=\{\(v\) => setFStatus\(v \|\| 'OPEN'\)\}/);
  assert.doesNotMatch(
    groupDetail,
    /placeholder=\{t\('common\.status'\)\}\s*\n\s*clearable/,
    'status select must not be clearable (would mix scopes)',
  );
});

test('view archive / view active empty-state actions reload with an explicit scope', () => {
  assert.match(groupDetail, /loadLedger = async \(statusOverride\)/);
  assert.match(groupDetail, /onClick=\{\(\) => \{ setFStatus\('LOCKED'\); loadLedger\('LOCKED'\); \}\}/);
  assert.match(groupDetail, /onClick=\{\(\) => \{ setFStatus\('OPEN'\); loadLedger\('OPEN'\); \}\}/);
  assert.match(groupDetail, /className="ledger-empty"/);
});

test('fully settled group with history offers the archive path', () => {
  // groupSettled (all nets zero) + real paid/share history => "All settled" + View archive.
  assert.match(groupDetail, /groupSettled && hasLedgerHistory \?/);
  assert.match(groupDetail, /hasLedgerHistory = \(summary \|\| \[\]\)\.some\(/);
});

test('reports and statement keep archived entries (no status filter in their fetches)', () => {
  // Spec: archived entries stay in financial history.
  assert.doesNotMatch(groupDetail, /ledger\?[^`]*status=/);
  assert.match(groupDetail, /api\.get\(`\/api\/v1\/groups\/\$\{id\}\/ledger\?type=payment&limit=100`\)/);
});

test('status labels are presented as Active/Archived in en and vi', () => {
  assert.equal(MESSAGES.en['groupDetail.statusOpen'], 'Active');
  assert.equal(MESSAGES.en['groupDetail.statusLocked'], 'Archived');
  assert.equal(MESSAGES.vi['groupDetail.statusOpen'], 'Đang hoạt động');
  assert.equal(MESSAGES.vi['groupDetail.statusLocked'], 'Đã lưu trữ');
  // Empty-state keys exist in both locales.
  for (const k of [
    'groupDetail.ledgerEmptyActive', 'groupDetail.ledgerEmptyArchive',
    'groupDetail.ledgerAllSettled', 'groupDetail.ledgerAllSettledHint',
    'groupDetail.viewArchive', 'groupDetail.viewActive',
  ]) {
    assert.ok(k in MESSAGES.en, `en missing ${k}`);
    assert.ok(k in MESSAGES.vi, `vi missing ${k}`);
  }
  // Source uses the keys, not hardcoded English, for pills and detail badge.
  assert.match(groupDetail, /item\.status === 'LOCKED' \? t\('groupDetail\.statusLocked'\)/);
  assert.match(expenseDetail, /t\('groupDetail\.statusLocked'\)/);
  assert.doesNotMatch(expenseDetail, /> \{x\.status\} </);
  assert.match(messagesSrc, /'groupDetail\.ledgerAllSettled'/);
});

test('group lifecycle badge copy is untouched (locked != archived)', () => {
  // Expense status was renamed; group access status (opening|locked|closed) was not.
  assert.match(messagesSrc, /'groupStatus\.locked': 'Locked'/);
  assert.match(messagesSrc, /'groupStatus\.locked': 'Tạm khóa'/);
  assert.match(groupDetail, /t\(`groupStatus\.\$\{groupLifecycle\}`\)/);
});

test('ledger empty-state block has styling (incl. dark theme)', () => {
  assert.match(styles, /\.ledger-empty \{/);
  assert.match(styles, /\[data-ss-theme="dark"\] \.ledger-empty \{/);
});

test('mobile ledger defaults to active scope with Active/Archived chips', () => {
  assert.match(MOBILE_GROUP, /useState\('OPEN'\)/);
  assert.match(MOBILE_GROUP, /\[\['OPEN', 'Active'\], \['LOCKED', 'Archived'\]\]/);
  assert.doesNotMatch(MOBILE_GROUP, /\['', 'OPEN', 'LOCKED'\]/, 'mixed "All" chip removed');
  // Status dot indicator only flags the non-default scope.
  assert.match(MOBILE_GROUP, /fStatus && fStatus !== 'OPEN' \? '•' : ''/);
  // Locked rows labelled Archived, all-settled empty state present.
  assert.match(MOBILE_GROUP, /'Archived · snapshot'/);
  assert.match(MOBILE_GROUP, /\{it\.status === 'LOCKED' \? 'ARCHIVED' : 'ACTIVE'\}/);
  assert.match(MOBILE_GROUP, />View archive</);
  assert.match(MOBILE_GROUP, />All settled 🎉</);
});

test('mobile detail badge and error copy use Archived wording', () => {
  assert.match(MOBILE_EXPENSE, /\{locked \? 'ARCHIVED' : 'ACTIVE'\}/);
  assert.match(MOBILE_EXPENSE, /Alert\.alert\('Archived', '403 — settled snapshot/);
  assert.match(MOBILE_EXPENSE, /ACTIVE only/);
  assert.doesNotMatch(MOBILE_EXPENSE, /Alert\.alert\('Locked', '403/);
});
