import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  ADD_EXPENSE_STATE, defaultGroupName, mergeMembers, resolveQuickAddFlow,
} from '../src/quickAdd.js';

const read = (p) => readFile(new URL(p, import.meta.url), 'utf8');
const quickAdd = await read('../src/components/QuickAddExpense.jsx');
const dashboard = await read('../src/pages/Dashboard.jsx');
const groupDetail = await read('../src/pages/GroupDetail.jsx');
const styles = await read('../src/styles.css');
const { MESSAGES } = await import('../src/i18n/messages.js');

test('flow routing: people+group → 1, group only → 2, people only → 3', () => {
  assert.equal(resolveQuickAddFlow(2, 'g1'), 'people-and-group');
  assert.equal(resolveQuickAddFlow(0, 'g1'), 'group');
  assert.equal(resolveQuickAddFlow(1, null), 'people');
  assert.equal(resolveQuickAddFlow(0, null), null);
});

test('mergeMembers unions by user_id and drops the current user', () => {
  const people = [{ user_id: 'a', display_name: 'Ann', username: 'ann' }];
  const members = [
    { user_id: 'me', display_name: 'Me', username: 'me', role: 'owner' },
    { user_id: 'a', display_name: 'Ann (dup)', username: 'ann' },
    { user_id: 'b', display_name: 'Bob', username: 'bob', role: 'member' },
  ];
  assert.deepEqual(mergeMembers(people, members, 'me'), [
    { user_id: 'a', display_name: 'Ann', username: 'ann' },
    { user_id: 'b', display_name: 'Bob', username: 'bob' },
  ]);
});

test('defaultGroupName is "You, names" within the 3-50 char server rule', () => {
  assert.equal(defaultGroupName([{ display_name: 'Ann' }, { display_name: 'Bob' }]), 'You, Ann, Bob');
  assert.equal(defaultGroupName([{ display_name: 'A' }], 'Bạn'), 'Bạn, A');
  const many = Array.from({ length: 12 }, (_, i) => ({ display_name: `Person Number ${i}` }));
  const name = defaultGroupName(many);
  assert.ok(name.length >= 3 && name.length <= 50, name);
  assert.match(name, /^You, Person Number 0, .* \+\d+$/);
});

test('picker UI order: multi-select, fixed-height contacts box, group select, Next', () => {
  const idx = (s) => quickAdd.indexOf(s);
  const multi = idx('<MultiSelect');
  const box = idx('className="qa-contacts"');
  const group = idx("label={t('quickAdd.group')}");
  const nextBtn = idx("{t('common.next')}");
  assert.ok(multi > 0 && multi < box && box < group && group < nextBtn);
  assert.match(quickAdd, /<Checkbox[\s\S]*checked=\{selected\.includes\(c\.user_id\)\}/);
  assert.match(styles, /\.qa-contacts \{\s*height: 440px;[\s\S]*?overflow-y: auto;/);
  assert.match(styles, /\.qa-fab \{\s*position: fixed;/);
});

test('group selection lists every group as a radio (no dropdown)', () => {
  assert.doesNotMatch(quickAdd, /<Select\b/);
  assert.match(quickAdd, /<Radio\.Group\s+label=\{t\('quickAdd\.group'\)\}/);
  assert.match(quickAdd, /<Radio className="qa-group" value="" label=\{t\('quickAdd\.noGroup'\)\} \/>/);
  assert.match(quickAdd, /\{groups\.map\(\(g\) => \(\s*<Radio/);
  assert.doesNotMatch(quickAdd, /filter\(\(x\) => x\.status !== 'closed'\)/);
  assert.match(quickAdd, /disabled=\{g\.status === 'closed'\}/);
});

test('flows navigate with the add-expense router state', () => {
  assert.deepEqual(ADD_EXPENSE_STATE, { addExpense: true });
  assert.equal((quickAdd.match(/state: ADD_EXPENSE_STATE/g) ?? []).length, 2);
  assert.match(quickAdd, /api\.post\('\/api\/v1\/groups'/);
  assert.match(quickAdd, /api\.get\(`\/api\/v1\/groups\/\$\{groupId\}`\)/);
  assert.match(quickAdd, /onCreateGroup\?\.\(mergeMembers\(people, d\?\.members/);
  assert.match(groupDetail, /location\.state\?\.addExpense\) \{[\s\S]*?setShowExp\(true\)/);
});

test('dashboard reuses the New-group wizard for Flow 1', () => {
  assert.match(dashboard, /<QuickAddExpense onCreateGroup=\{openWizardForExpense\} \/>/);
  assert.match(dashboard, /const openWizardForExpense = \(members\) => \{\s*openWizard\(\);\s*setPicked\(members\);\s*setForExpense\(true\);/);
  assert.match(dashboard, /if \(forExpense\) \{\s*setOpen\(false\);\s*nav\(`\/groups\/\$\{gid\}`, \{ state: ADD_EXPENSE_STATE \}\);/);
  assert.match(dashboard, /forExpense \? t\('common\.next'\) : t\('wizard\.createGroup'\)/);
});

test('group detail shows the FAB and it opens the normal expense form', () => {
  assert.match(quickAdd, /export function AddExpenseFab\(\{ onClick, disabled = false \}\)/);
  assert.match(quickAdd, /<AddExpenseFab onClick=\{openPicker\} \/>/);
  assert.match(groupDetail, /import \{ AddExpenseFab \} from '\.\.\/components\/QuickAddExpense\.jsx'/);
  assert.match(groupDetail, /<AddExpenseFab onClick=\{\(\) => setShowExp\(true\)\} disabled=\{!canWriteGroup\} \/>/);
  assert.doesNotMatch(groupDetail, /<QuickAddExpense/);
});

test('quickAdd keys exist in en and vi', () => {
  const keys = Object.keys(MESSAGES.en).filter((k) => k.startsWith('quickAdd.'));
  assert.ok(keys.length >= 10);
  for (const k of keys) assert.ok(k in MESSAGES.vi, `vi missing ${k}`);
  for (const f of ['none', 'group', 'people', 'people-and-group']) {
    assert.ok(`quickAdd.hint.${f}` in MESSAGES.en);
  }
});
