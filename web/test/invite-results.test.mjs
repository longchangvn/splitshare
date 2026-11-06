import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  inviteRows, inviteSummary, inviteSummaryMessage, inviteRowMessage,
} from '../src/inviteResults.js';
import { MESSAGES } from '../src/i18n/messages.js';

const response = {
  added: ['old@x.io'],
  pending: ['new@x.io', 'bounce@x.io', 'dev@x.io'],
  results: [
    { email: 'old@x.io', status: 'added', email_sent: true, email_status: 'sent', email_error: null },
    { email: 'new@x.io', status: 'invited', email_sent: true, email_status: 'sent', email_error: null },
    { email: 'bounce@x.io', status: 'invited', email_sent: false, email_status: 'failed', email_error: 'HTTP 400' },
    { email: 'dev@x.io', status: 'invited', email_sent: false, email_status: 'not_configured', email_error: 'x' },
  ],
};

test('rows mirror the API results and only email_sent=true counts as sent', () => {
  const rows = inviteRows(response);
  assert.deepEqual(rows.map((r) => [r.email, r.status, r.emailSent, r.emailStatus]), [
    ['old@x.io', 'added', true, 'sent'],
    ['new@x.io', 'invited', true, 'sent'],
    ['bounce@x.io', 'invited', false, 'failed'],
    ['dev@x.io', 'invited', false, 'not_configured'],
  ]);
  assert.equal(rows[2].error, 'HTTP 400');
  // A "sent" status without email_sent=true is not trusted.
  const [r] = inviteRows({ results: [{ email: 'a@x.io', status: 'invited', email_status: 'sent' }] });
  assert.equal(r.emailSent, false);
  assert.equal(r.emailStatus, 'failed');
});

test('responses without results are never reported as sent', () => {
  const rows = inviteRows({ added: ['a@x.io'], pending: ['b@x.io'] });
  assert.deepEqual(rows.map((r) => [r.email, r.status, r.emailSent, r.emailStatus]), [
    ['a@x.io', 'added', false, 'unknown'],
    ['b@x.io', 'invited', false, 'unknown'],
  ]);
  assert.deepEqual(inviteRows(null), []);
  assert.deepEqual(inviteRows({ results: [null, { email: 5 }] }), []);
});

test('summary tone and message', () => {
  const rows = inviteRows(response);
  assert.deepEqual(inviteSummary(rows), { total: 4, sent: 2, failed: 2, tone: 'partial' });
  assert.deepEqual(inviteSummaryMessage(inviteSummary(rows)), { key: 'invite.resultSomeFailed', vars: { sent: 2, total: 4 } });
  assert.equal(inviteSummary(rows.slice(0, 2)).tone, 'success');
  assert.equal(inviteSummary(rows.slice(2)).tone, 'error');
  assert.equal(inviteSummary([]).tone, 'empty');
});

test('row messages explain failures', () => {
  const [added, sent, failed, unconfigured] = inviteRows(response).map(inviteRowMessage);
  assert.deepEqual(added, { key: 'invite.rowAddedSent', detailKey: null, detail: null });
  assert.equal(sent.key, 'invite.rowInvitedSent');
  assert.deepEqual(failed, { key: 'invite.rowInvitedNoEmail', detailKey: null, detail: 'HTTP 400' });
  assert.equal(unconfigured.detailKey, 'invite.emailNotConfigured');
  const [legacy] = inviteRows({ pending: ['b@x.io'] }).map(inviteRowMessage);
  assert.equal(legacy.detailKey, 'invite.emailUnverified');
});

test('every invite/invitation key used by the UI exists in every locale', async () => {
  const sources = await Promise.all([
    '../src/inviteResults.js', '../src/components/InviteResults.jsx', '../src/pages/InvitationPage.jsx',
  ].map((p) => readFile(new URL(p, import.meta.url), 'utf8')));
  const keys = new Set(sources.join('\n').match(/'(invite|invitation)\.[A-Za-z]+'/g).map((k) => k.slice(1, -1)));
  assert.ok(keys.size > 20);
  for (const [locale, messages] of Object.entries(MESSAGES)) {
    for (const k of keys) assert.ok(messages[k], `${locale} is missing ${k}`);
  }
});
