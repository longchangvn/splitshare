import {
  test, expect, registerAccount, createGroup, addExpense, signIn, dialogWith, visibleText, unique,
} from './helpers.js';

test('statement tab lists expenses and payments for the group', async ({ page, request }) => {
  const owner = await registerAccount(request, { prefix: 'stmt-owner', name: 'Statement Owner' });
  const peer = await registerAccount(request, { prefix: 'stmt-peer', name: 'Statement Peer' });
  const groupId = await createGroup(request, owner, { name: unique('Statement group'), members: [peer] });
  const title = unique('Statement dinner');
  const expense = await addExpense(request, owner, groupId, {
    title,
    amount: 40,
    participantIds: [owner.id, peer.id],
  });
  // One payment so the statement has both kinds of entry.
  await request.fetch(`/api/v1/groups/${groupId}/payments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${peer.accessToken}` },
    data: { from_user_id: peer.id, to_user_id: owner.id, amount: 10, method: 'cash' },
  });

  await signIn(page, owner);
  await page.goto(`/groups/${groupId}`);
  await page.getByRole('tab', { name: 'Statement' }).click();

  await expect(visibleText(page, title).first()).toBeVisible();
  await expect(page.getByText(/Payment/i).filter({ visible: true }).first()).toBeVisible();
  expect(expense.amount_cents).toBe(4000);
});

test('activity feed lists the group expense', async ({ page, request }) => {
  const owner = await registerAccount(request, { prefix: 'act-owner', name: 'Activity Owner' });
  const groupId = await createGroup(request, owner, { name: unique('Activity group') });
  const title = unique('Activity dinner');
  await addExpense(request, owner, groupId, { title, amount: 15, participantIds: [owner.id] });

  await signIn(page, owner);
  await page.goto('/activity');
  await expect(page.getByText(title).filter({ visible: true }).first()).toBeVisible();
});

test('report page renders totals and category breakdown', async ({ page, request }) => {
  const owner = await registerAccount(request, { prefix: 'rpt-owner', name: 'Report Owner' });
  const groupName = unique('Report group');
  const groupId = await createGroup(request, owner, { name: groupName });
  await addExpense(request, owner, groupId, {
    title: unique('Report dinner'),
    amount: 25,
    participantIds: [owner.id],
    extra: { category: 'food' },
  });

  await signIn(page, owner);
  await page.goto(`/groups/${groupId}/report`);
  await expect(page.getByText(groupName, { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Spent vs share' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'By category' })).toBeVisible();
  await expect(page.getByText('$25.00').first()).toBeVisible();
});

test('group page adds, renames and deletes a category', async ({ page, request }) => {
  const owner = await registerAccount(request, { prefix: 'cat-owner', name: 'Category Owner' });
  const groupName = unique('Category group');
  const groupId = await createGroup(request, owner, { name: groupName });

  await signIn(page, owner);
  await page.goto(`/groups/${groupId}`);
  await expect(page.getByRole('heading', { name: groupName })).toBeVisible();

  const manager = page.getByRole('region', { name: 'Categories' });
  await manager.getByRole('button', { name: 'Add category' }).click();
  const add = dialogWith(page, 'Add category');
  await add.getByLabel('Name').fill('Ski Rental');
  await add.getByRole('button', { name: 'Add category' }).click();
  await expect(manager.getByText('Ski Rental', { exact: true })).toBeVisible();

  await manager.getByRole('button', { name: 'Edit Ski Rental' }).click();
  const rename = dialogWith(page, 'Rename');
  await rename.getByLabel('Name').fill('Ski Rentals');
  await rename.getByRole('button', { name: 'Save changes' }).click();
  await expect(manager.getByText('Ski Rentals', { exact: true })).toBeVisible();

  await manager.getByRole('button', { name: 'Delete Ski Rentals' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(manager.getByText('Ski Rentals', { exact: true })).toHaveCount(0);
});
