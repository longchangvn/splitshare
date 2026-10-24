import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (p) => readFile(new URL(p, import.meta.url), 'utf8');
const forms = await read('../src/components/Forms.jsx');
const groupDetail = await read('../src/pages/GroupDetail.jsx');
const styles = await read('../src/styles.css');
const { MESSAGES, LOCALES } = await import('../src/i18n/messages.js');

const expenseForm = forms.slice(forms.indexOf('export function ExpenseForm'), forms.indexOf('<Modal', forms.indexOf('export function ExpenseForm')));

test('every locale has Save & new / Save & close labels', () => {
  for (const loc of LOCALES) {
    for (const key of ['forms.expense.saveNew', 'forms.expense.saveClose', 'forms.expense.saved', 'common.cancel']) {
      assert.ok(MESSAGES[loc][key], `${loc} missing ${key}`);
    }
  }
  assert.equal(MESSAGES.en['forms.expense.saveNew'], 'Save & new');
  assert.equal(MESSAGES.en['forms.expense.saveClose'], 'Save & close');
  assert.equal(MESSAGES.vi['forms.expense.saveNew'], 'Lưu & thêm mới');
  assert.equal(MESSAGES.vi['forms.expense.saveClose'], 'Lưu & đóng');
});

test('ExpenseForm accepts onSaveNew/onCancel and only splits the footer for create', () => {
  assert.match(forms, /export function ExpenseForm\(\{[^}]*onSaveNew, onCancel[^}]*\}\)/);
  assert.match(expenseForm, /const multiSave = !existing && !!onSaveNew;/);
  assert.match(expenseForm, /\{!confirm && multiSave && \(/);
  // Edit keeps the single "Save changes" button.
  assert.match(expenseForm, /\{!confirm && !multiSave && \([\s\S]*?existing \? t\('common\.saveChanges'\)/);
});

test('footer order: Cancel, Save & new, Save & close; each submit sets its mode', () => {
  const start = expenseForm.indexOf('{!confirm && multiSave && (');
  const block = expenseForm.slice(start, expenseForm.indexOf('{!confirm && !multiSave', start));
  const cancel = block.indexOf("t('common.cancel')");
  const saveNew = block.indexOf("t('forms.expense.saveNew')");
  const saveClose = block.indexOf("t('forms.expense.saveClose')");
  assert.ok(cancel > 0 && cancel < saveNew && saveNew < saveClose, 'button order');
  assert.match(block, /type="button" onClick=\{onCancel\}/);
  assert.match(block, /type="submit"\s+onClick=\{\(\) => \{ saveModeRef\.current = 'new'; \}\}/);
  assert.match(block, /type="submit"\s+onClick=\{\(\) => \{ saveModeRef\.current = 'close'; \}\}/);
  // Only the clicked button spins; the other is disabled to block double-submit.
  assert.match(block, /loading=\{saving && savingMode === 'new'\}/);
  assert.match(block, /loading=\{saving && savingMode === 'close'\}/);
});

test('submit: Save & new calls onSaveNew (form stays open), otherwise onDone; Enter defaults to close', () => {
  const sub = expenseForm.slice(expenseForm.indexOf('const submit = async'), expenseForm.indexOf('const submitEdit'));
  // Mode is consumed and reset before validation so a failed attempt can't leak "new" into Enter.
  const consume = sub.indexOf("saveModeRef.current = 'close';");
  assert.ok(consume > 0 && consume < sub.indexOf('moneyAmountError'), 'mode reset before validation');
  assert.match(sub, /if \(mode === 'new' && onSaveNew\) \{[\s\S]*?onSaveNew\(r\);[\s\S]*?\} else \{\s*onDone\(r\);/);
  assert.match(sub, /if \(!notified\) notifications\.show\(\{ title: t\('forms\.expense\.saved'\)/);
  assert.match(expenseForm, /const saveModeRef = useRef\('close'\);/);
});

test('group detail resets the new-expense form in place on Save & new', () => {
  assert.match(groupDetail, /const \[expFormKey, setExpFormKey\] = useState\(0\);/);
  const at = groupDetail.indexOf('<ExpenseForm\n          key={expFormKey}');
  assert.ok(at !== -1, 'new-expense form is keyed by expFormKey');
  const block = groupDetail.slice(at, at + 700);
  const saveNew = block.match(/onSaveNew=\{\(\) => \{([^}]*)\}\}/);
  assert.ok(saveNew, 'onSaveNew handler present');
  assert.match(saveNew[1], /setExpFormKey\(\(k\) => k \+ 1\)/);
  assert.match(saveNew[1], /setCopyFrom\(null\)/);
  assert.match(saveNew[1], /load\(\); loadLedger\(\); loadSummary\(\);/);
  assert.doesNotMatch(saveNew[1], /setShowExp\(false\)/, 'Save & new must keep the popup open');
  assert.match(block, /onCancel=\{\(\) => \{ setShowExp\(false\); setCopyFrom\(null\); \}\}/);
  assert.match(block, /onDone=\{\(\) => \{ setShowExp\(false\);/);
});

test('edit modal does not get Save & new', () => {
  const at = groupDetail.indexOf('existing={editExisting}');
  const block = groupDetail.slice(at, at + 300);
  assert.doesNotMatch(block, /onSaveNew/);
  assert.match(styles, /\.expense-save-actions \{ flex-wrap: wrap; \}/);
});
