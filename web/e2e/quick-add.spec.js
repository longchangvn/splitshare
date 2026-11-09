import {
  test, expect, registerAccount, createGroup, signIn, dialogWith, visibleText, unique,
} from './helpers.js';

test('quick add picks an existing group and opens its expense form', async ({ page, request }) => {
  const owner = await registerAccount(request, { prefix: 'qa-owner', name: 'Quick Owner' });
  const groupName = unique('Quick group');
  const groupId = await createGroup(request, owner, { name: groupName });
  const title = unique('Quick dinner');

  await signIn(page, owner);
  await page.goto('/');
  await page.getByRole('button', { name: 'Add expense', exact: true }).click();

  const picker = dialogWith(page, 'Add expense');
  await picker.getByText(groupName, { exact: true }).click();
  await picker.getByRole('button', { name: 'Next' }).click();

  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}`));
  const form = dialogWith(page, 'New expense');
  await form.getByLabel('Title').fill(title);
  await form.getByLabel('Amount').fill('18');
  await form.getByRole('button', { name: 'Save & close' }).click();

  await expect(visibleText(page, title).first()).toBeVisible();
});
