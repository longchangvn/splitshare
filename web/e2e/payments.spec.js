import {
  test, expect, registerAccount, createGroup, addExpense, signIn, dialogWith, groupLedger, unique,
} from './helpers.js';

test('record a payment that settles the group', async ({ page, request }) => {
  const owner = await registerAccount(request, { prefix: 'pay-owner', name: 'Pay Owner' });
  const debtor = await registerAccount(request, { prefix: 'pay-debtor', name: 'Pay Debtor' });
  const groupId = await createGroup(request, owner, {
    name: unique('Pay group'),
    members: [debtor],
  });
  // The owner pays 30 for the debtor alone, so the debtor owes the full 30.
  await addExpense(request, owner, groupId, {
    title: unique('Pay dinner'),
    amount: 30,
    participantIds: [debtor.id],
  });

  await signIn(page, owner);
  await page.goto(`/groups/${groupId}`);
  await page.getByRole('button', { name: 'Record payment' }).filter({ visible: true }).first().click();

  const form = dialogWith(page, 'Record payment');
  await form.getByLabel('From').click();
  await page.getByRole('option', { name: debtor.name }).click();
  await form.getByLabel('To').click();
  await page.getByRole('option', { name: owner.name }).click();
  await form.getByLabel('Amount').fill('30');
  await form.getByRole('button', { name: 'Record payment' }).click();

  await expect(page.getByText('Fully settled', { exact: true })).toBeVisible();

  const ledger = await groupLedger(request, owner, groupId);
  expect(ledger.total).toBe(2);
  const payment = ledger.items.find((item) => item.kind === 'payment');
  expect(payment, 'payment row is in the ledger').toBeTruthy();
  expect(payment.amount_cents).toBe(3000);
  expect(payment.status).toBe('LOCKED');
});
