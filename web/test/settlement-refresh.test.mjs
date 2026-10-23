import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const groupDetail = await readFile(new URL('../src/pages/GroupDetail.jsx', import.meta.url), 'utf8');
const report = await readFile(new URL('../src/pages/Report.jsx', import.meta.url), 'utf8');
const box = await readFile(new URL('../src/components/SettlementBox.jsx', import.meta.url), 'utf8');

test('group detail keeps a settlement refresh tick', () => {
  assert.match(groupDetail, /const \[settleTick, setSettleTick\] = useState\(0\);/);
});

test('recording a payment bumps the tick in the PaymentForm onDone handler', () => {
  // Scope to the PaymentForm's onDone — other onDone handlers (expense
  // forms) must not be mistaken for the payment callback.
  const payForm = groupDetail.indexOf('<PaymentForm');
  assert.ok(payForm !== -1, 'expected the payment modal to render a PaymentForm');
  const done = groupDetail.indexOf('onDone={(r) => {', payForm);
  assert.ok(done !== -1 && done - payForm < 400, 'onDone must follow PaymentForm closely');
  const block = groupDetail.slice(done, done + 500);
  assert.match(block, /setSettleTick\(\(x\) => x \+ 1\);/);
  // Existing refreshes stay in place alongside the new one.
  assert.match(block, /loadActivityFeed\(\);/);
  assert.match(block, /r\.fully_settled/);
});

test('group detail feeds its fresh plan and tick into the report panel', () => {
  const rp = groupDetail.indexOf('<ReportPanel');
  assert.ok(rp !== -1, 'expected an embedded ReportPanel');
  const block = groupDetail.slice(rp, rp + 400);
  // Passing the group detail's own plan (already re-fetched via load() after
  // payment) supersedes the report's one-off settlement fetch.
  assert.match(block, /plan=\{plan\}/);
  assert.match(block, /settleTick=\{settleTick\}/);
});

test('report panel forwards the tick to the settlement box', () => {
  assert.match(report, /settleTick = 0,/); // prop with default
  const sb = report.indexOf('<SettlementBox');
  assert.ok(sb !== -1, 'expected a SettlementBox in the report');
  const block = report.slice(sb, sb + 300);
  assert.match(block, /plan=\{plan\}/);
  assert.match(block, /settleTick=\{settleTick\}/);
});

test('settlement box re-fetches plan and completed payments when the tick changes', () => {
  assert.match(box, /settleTick = 0/);
  // Plan effect: prop-driven when embedded, self-load otherwise — both re-run on tick.
  assert.match(box, /\}, \[groupId, planProp, settleTick\]\);/);
  // Completed-payments list in the detail dialog re-runs on tick too.
  assert.match(box, /\}, \[groupId, settleTick\]\);/);
});
