import { test, expect } from '@playwright/test';

// One account is created per run; keep its credentials for the whole file.
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const email = `web-e2e-${runId}@example.test`;
const password = `Aa1${runId.replace(/-/g, '')}`;
const groupName = `E2E Trip ${runId}`;
const expenseTitle = `E2E dinner ${runId}`;

test.describe.configure({ mode: 'serial' });

test('register, create a group and add an expense', async ({ page }) => {
  // Register with a password (no email round trip needed for this suite).
  await page.goto('/register');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Use a password' }).click();
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  // New group → name → create → open it.
  await page.getByRole('button', { name: 'New group' }).first().click();
  await page.getByLabel('Group name').fill(groupName);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Create group' }).click();
  await page.getByRole('button', { name: 'Open group' }).click();

  await expect(page.getByRole('heading', { name: groupName })).toBeVisible();

  // Add an expense with the shared form (payer/participants default to me).
  await page.getByRole('button', { name: 'Add expense', exact: true }).first().click();
  const expenseDialog = page.getByRole('dialog').filter({ hasText: 'New expense' });
  await expenseDialog.getByLabel('Title').fill(expenseTitle);
  await expenseDialog.getByLabel('Amount').fill('12.50');
  await expenseDialog.getByRole('button', { name: 'Save & close' }).click();

  const ledgerTitle = page.getByText(expenseTitle, { exact: true }).filter({ visible: true });
  await expect(ledgerTitle.first()).toBeVisible();

  // The ledger is server-backed: a reload must still show the expense.
  await page.reload();
  await expect(ledgerTitle.first()).toBeVisible();
});

