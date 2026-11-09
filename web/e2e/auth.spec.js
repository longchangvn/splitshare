import { test, expect, registerAccount, signIn } from './helpers.js';

test('password login then logout from profile', async ({ page, request }) => {
  const account = await registerAccount(request, { prefix: 'login' });

  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email' }).fill(account.email);
  await page.getByRole('textbox', { name: 'Password' }).fill(account.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  await page.goto('/profile');
  await page.getByRole('button', { name: 'Log out' }).click();
  const confirm = page.getByRole('dialog').filter({ hasText: 'Log out of SplitShare?' });
  await confirm.getByRole('button', { name: 'Log out' }).click();

  await expect(page).toHaveURL(/\/login/);
  const tokens = await page.evaluate(() => ({
    access: localStorage.getItem('ss_at'),
    refresh: localStorage.getItem('ss_rt'),
  }));
  expect(tokens).toEqual({ access: null, refresh: null });
});

test('delete account from the profile danger tab signs out', async ({ page, request }) => {
  const account = await registerAccount(request, { prefix: 'delete-me' });

  await signIn(page, account);
  await page.goto('/profile');
  await page.getByRole('tab', { name: 'Danger' }).click();
  await page.getByRole('button', { name: 'Delete account' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();

  await expect(page).toHaveURL(/\/login/);
  const me = await request.get('/api/v1/me', {
    headers: { Authorization: `Bearer ${account.accessToken}` },
  });
  expect(me.status()).toBe(401);
});

test('protected pages send anonymous visitors to login', async ({ page }) => {
  await page.goto('/groups');
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});
