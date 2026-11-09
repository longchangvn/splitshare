import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

/**
 * Browser E2E helpers. Accounts and fixtures are seeded through the same API the
 * UI uses (via the Vite proxy), so each test starts from known data without
 * repeating registration/group setup through the UI. Flows under test still run
 * in the browser.
 */

export { test, expect };

export function unique(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
}

export async function registerAccount(request, { prefix = 'user', name } = {}) {
  const id = unique(prefix);
  const email = `${id}@example.test`;
  const password = `Aa1${randomUUID().replace(/-/g, '')}`;
  const displayName = name ?? `E2E ${id.slice(-10)}`;
  const res = await request.post('/api/v1/auth/register', {
    data: { email, password, display_name: displayName },
  });
  expect(res.ok(), `register ${email} -> ${res.status()} ${await res.text()}`).toBeTruthy();
  const body = await res.json();
  return {
    email,
    password,
    name: body.user.display_name,
    id: body.user.user_id,
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
  };
}

const authHeaders = (account) => ({ Authorization: `Bearer ${account.accessToken}` });

export async function apiJson(request, account, method, path, data) {
  const res = await request.fetch(path, {
    method,
    headers: authHeaders(account),
    data,
  });
  const text = await res.text();
  expect(res.ok(), `${method} ${path} -> ${res.status()}: ${text}`).toBeTruthy();
  return text ? JSON.parse(text) : null;
}

export async function createGroup(request, owner, { name, members = [] } = {}) {
  const body = await apiJson(request, owner, 'POST', '/api/v1/groups', {
    name: name ?? unique('Group'),
    currency: 'USD',
    member_ids: members.map((m) => m.id),
  });
  return body.group.id;
}

export async function addExpense(request, owner, groupId, {
  title = unique('Expense'),
  amount = 10,
  payerId = owner.id,
  participantIds = [owner.id],
  splitType = 'EQUAL',
  extra = {},
} = {}) {
  const body = await apiJson(request, owner, 'POST', `/api/v1/groups/${groupId}/expenses`, {
    title,
    amount,
    payer_id: payerId,
    split_type: splitType,
    participant_ids: participantIds,
    ...extra,
  });
  return { ...body.expense, title };
}

export async function groupLedger(request, account, groupId) {
  return apiJson(request, account, 'GET', `/api/v1/groups/${groupId}/ledger`);
}

export async function expenseDetail(request, account, expenseId) {
  return apiJson(request, account, 'GET', `/api/v1/expenses/${expenseId}`);
}

/** Seeds the session directly: the app's own token keys, no UI detour. */
export async function signIn(page, account) {
  await page.addInitScript(({ at, rt }) => {
    localStorage.setItem('ss_at', at);
    localStorage.setItem('ss_rt', rt);
  }, { at: account.accessToken, rt: account.refreshToken });
}

/** A dialog by a title fragment (Mantine keeps only the open modal reachable). */
export const dialogWith = (page, text) => page.getByRole('dialog').filter({ hasText: text });

/** First visible occurrence: the ledger renders mobile + desktop variants. */
export const visibleText = (page, text) =>
  page.getByText(text, { exact: true }).filter({ visible: true });

