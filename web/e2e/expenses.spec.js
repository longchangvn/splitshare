import {
  test, expect, registerAccount, createGroup, addExpense, signIn,
  dialogWith, visibleText, groupLedger, expenseDetail, unique,
} from './helpers.js';

// The shared expense form is the single entry point for add / quick add / copy,
// so these specs drive it through the group page like a user would.

test('percent split saves 60/40 shares for the selected participants', async ({ page, request }) => {
  const owner = await registerAccount(request, { prefix: 'pct-owner', name: 'Percent Owner' });
  const peerA = await registerAccount(request, { prefix: 'pct-a', name: 'Percent A' });
  const peerB = await registerAccount(request, { prefix: 'pct-b', name: 'Percent B' });
  const groupId = await createGroup(request, owner, {
    name: unique('Percent group'),
    members: [peerA, peerB],
  });
  const title = unique('Percent dinner');

  await signIn(page, owner);
  await page.goto(`/groups/${groupId}`);
  await page.getByRole('button', { name: 'Add expense', exact: true }).first().click();

  const dialog = dialogWith(page, 'New expense');
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByLabel('Amount').fill('100');
  await dialog.getByRole('radio', { name: 'Percent' }).click();

  // Everyone is a participant by default; drop B and split 60/40.
  await dialog.getByRole('checkbox', { name: peerB.name }).uncheck();
  await dialog.getByLabel(`Percent % for ${peerA.name}`).fill('60');
  await dialog.getByLabel(`Percent % for ${owner.name}`).fill('40');
  await dialog.getByRole('button', { name: 'Save & close' }).click();

  await expect(visibleText(page, title).first()).toBeVisible();

  const ledger = await groupLedger(request, owner, groupId);
  const row = ledger.items.find((item) => item.title === title);
  expect(row, 'expense is in the ledger').toBeTruthy();
  const detail = await expenseDetail(request, owner, row.id);
  const shares = Object.fromEntries(detail.expense.splits.map((s) => [s.user_id, s.share_cents]));
  expect(shares).toEqual({
    [peerA.id]: 6000,
    [owner.id]: 4000,
  });
});

test('remembered split: Save & new and reopening keep method, people and percents (specs/007)', async ({ page, request }) => {
  const owner = await registerAccount(request, { prefix: 'mem-owner', name: 'Memory Owner' });
  const peerA = await registerAccount(request, { prefix: 'mem-a', name: 'Memory A' });
  const peerB = await registerAccount(request, { prefix: 'mem-b', name: 'Memory B' });
  const groupId = await createGroup(request, owner, { name: unique('Memory group'), members: [peerA, peerB] });
  const first = unique('Memory first');
  const second = unique('Memory second');

  await signIn(page, owner);
  await page.goto(`/groups/${groupId}`);
  await page.getByRole('button', { name: 'Add expense', exact: true }).first().click();
  let dialog = dialogWith(page, 'New expense');
  await dialog.getByLabel('Title').fill(first);
  await dialog.getByLabel('Amount').fill('100');
  await dialog.getByRole('radio', { name: 'Percent' }).click();
  await dialog.getByRole('checkbox', { name: peerB.name }).uncheck();
  await dialog.getByLabel(`Percent % for ${peerA.name}`).fill('60');
  await dialog.getByLabel(`Percent % for ${owner.name}`).fill('40');
  await dialog.getByRole('button', { name: 'Save & new' }).click();

  // Fresh form, same split: no re-selecting the method or the people.
  await expect(dialog.getByLabel('Title')).toHaveValue('');
  await expect(dialog.getByText('Using your last split')).toBeVisible();
  await expect(dialog.getByRole('radio', { name: 'Percent' })).toHaveAttribute('aria-checked', 'true');
  await expect(dialog.getByRole('checkbox', { name: peerB.name })).not.toBeChecked();
  await expect(dialog.getByLabel(`Percent % for ${peerA.name}`)).toHaveValue('60');
  await dialog.getByLabel('Title').fill(second);
  await dialog.getByLabel('Amount').fill('50');
  await dialog.getByRole('button', { name: 'Save & close' }).click();
  await expect(visibleText(page, second).first()).toBeVisible();

  const ledger = await groupLedger(request, owner, groupId);
  const row = ledger.items.find((item) => item.title === second);
  const detail = await expenseDetail(request, owner, row.id);
  const shares = Object.fromEntries(detail.expense.splits.map((s) => [s.user_id, s.share_cents]));
  expect(shares).toEqual({ [peerA.id]: 3000, [owner.id]: 2000 });

  // Reopening (even after a reload) still remembers it; Reset goes back to the defaults.
  await page.reload();
  await page.getByRole('button', { name: 'Add expense', exact: true }).first().click();
  dialog = dialogWith(page, 'New expense');
  await expect(dialog.getByRole('radio', { name: 'Percent' })).toHaveAttribute('aria-checked', 'true');
  await dialog.getByRole('button', { name: 'Reset' }).click();
  await expect(dialog.getByRole('radio', { name: 'Equal' })).toHaveAttribute('aria-checked', 'true');
  await expect(dialog.getByRole('checkbox', { name: peerB.name })).toBeChecked();
});

test('edit expense updates title and amount in the ledger', async ({ page, request }) => {
  const owner = await registerAccount(request, { prefix: 'edit-owner', name: 'Edit Owner' });
  const peer = await registerAccount(request, { prefix: 'edit-peer', name: 'Edit Peer' });
  const groupId = await createGroup(request, owner, { name: unique('Edit group'), members: [peer] });
  const title = unique('Editable dinner');
  const editedTitle = `${title} v2`;
  await addExpense(request, owner, groupId, {
    title,
    amount: 10,
    participantIds: [owner.id, peer.id],
  });

  await signIn(page, owner);
  await page.goto(`/groups/${groupId}`);
  await page.getByRole('button', { name: `Edit ${title}` }).filter({ visible: true }).click();

  const dialog = dialogWith(page, 'Edit expense');
  await dialog.getByLabel('Title').fill(editedTitle);
  await dialog.getByLabel('Amount').fill('25');
  await dialog.getByRole('button', { name: 'Save changes' }).click();

  await expect(visibleText(page, editedTitle).first()).toBeVisible();
  const ledger = await groupLedger(request, owner, groupId);
  const row = ledger.items.find((item) => item.title === editedTitle);
  expect(row.amount_cents).toBe(2500);
});

test('copy expense creates a second ledger row', async ({ page, request }) => {
  const owner = await registerAccount(request, { prefix: 'copy-owner', name: 'Copy Owner' });
  const groupId = await createGroup(request, owner, { name: unique('Copy group') });
  const title = unique('Copied dinner');
  await addExpense(request, owner, groupId, { title, amount: 12.5, participantIds: [owner.id] });

  await signIn(page, owner);
  await page.goto(`/groups/${groupId}`);
  await page.getByRole('button', { name: `Copy ${title}` }).filter({ visible: true }).click();

  const dialog = dialogWith(page, 'Copy expense');
  await expect(dialog.getByLabel('Title')).toHaveValue(`Copy of ${title}`);
  await dialog.getByRole('button', { name: 'Save & close' }).click();

  await expect(visibleText(page, `Copy of ${title}`).first()).toBeVisible();
  const ledger = await groupLedger(request, owner, groupId);
  expect(ledger.items.filter((item) => item.kind === 'expense')).toHaveLength(2);
});

test('delete expense from its detail page removes it from the ledger', async ({ page, request }) => {
  const owner = await registerAccount(request, { prefix: 'del-owner', name: 'Delete Owner' });
  const groupId = await createGroup(request, owner, { name: unique('Delete group') });
  const title = unique('Delete dinner');
  const expense = await addExpense(request, owner, groupId, {
    title,
    amount: 9,
    participantIds: [owner.id],
  });

  await signIn(page, owner);
  await page.goto(`/groups/${groupId}/expenses/${expense.expense_id}`);
  await page.getByRole('button', { name: 'Delete', exact: true }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();

  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}$`));
  await expect.poll(async () => {
    const ledger = await groupLedger(request, owner, groupId);
    return ledger.items.some((item) => item.title === title);
  }).toBe(false);
});
