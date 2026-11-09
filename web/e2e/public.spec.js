import {
  test, expect, registerAccount, createGroup, addExpense, apiJson, unique,
} from './helpers.js';

test('public share page shows the group ledger without signing in', async ({ page, request }) => {
  const owner = await registerAccount(request, { prefix: 'share-owner', name: 'Share Owner' });
  const peer = await registerAccount(request, { prefix: 'share-peer', name: 'Share Peer' });
  const groupName = unique('Shared trip');
  const groupId = await createGroup(request, owner, { name: groupName, members: [peer] });
  await addExpense(request, owner, groupId, {
    title: unique('Shared dinner'),
    amount: 30,
    participantIds: [peer.id],
  });

  const minted = await apiJson(request, owner, 'POST', `/api/v1/groups/${groupId}/share-link`, {});
  const token = minted.invite_link.split('?')[0].replace(/\/+$/, '').split('/').pop();

  await page.goto(`/s/${token}`);
  await expect(page.getByRole('heading', { name: groupName })).toBeVisible();
  await expect(page.getByText('Who pays whom')).toBeVisible();
  // The debtor pays the owner in full, read from the anonymous page.
  await expect(page.getByText(/Share Peer → Share Owner/)).toBeVisible();
  await expect(page.getByText('$30.00').first()).toBeVisible();
});

test('anonymous group link shows the invitation landing', async ({ page, request }) => {
  const owner = await registerAccount(request, { prefix: 'landing-owner', name: 'Landing Owner' });
  const groupName = unique('Landing group');
  const created = await apiJson(request, owner, 'POST', '/api/v1/groups', {
    name: groupName,
    currency: 'USD',
  });
  const groupId = created.group.id;
  const detail = await apiJson(request, owner, 'GET', `/api/v1/groups/${groupId}`);
  const token = detail.invite_link.split('?')[0].replace(/\/+$/, '').split('/').pop();

  await page.goto(`/g/${token}`);
  await expect(page.getByRole('heading', { name: 'How do you want to continue?' })).toBeVisible();
  await expect(page.getByText(groupName)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Register new account' })).toBeVisible();
});
