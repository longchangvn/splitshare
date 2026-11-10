import {
  test, expect, registerAccount, createGroup, apiJson, signIn, dialogWith, unique,
} from './helpers.js';

test('owner reads the invite link and a signed-in account joins with it', async ({ page, browser, request }) => {
  const owner = await registerAccount(request, { prefix: 'inv-owner', name: 'Invite Owner' });
  const joiner = await registerAccount(request, { prefix: 'inv-joiner', name: 'Invite Joiner' });
  const groupName = unique('Invite group');
  const groupId = await createGroup(request, owner, { name: groupName });

  // Read the stable invite link from the group's Invite modal.
  await signIn(page, owner);
  await page.goto(`/groups/${groupId}`);
  await page.getByRole('button', { name: 'Invite members' }).filter({ visible: true }).click();
  const invite = dialogWith(page, 'Invite');
  await invite.getByRole('tab', { name: 'Invite link' }).click();
  const link = await invite.getByRole('textbox', { name: 'Invite link' }).inputValue();
  expect(link).toContain('/g/');
  const token = link.split('?')[0].replace(/\/+$/, '').split('/').pop();

  // A second, already signed-in account opens the link; JoinPage joins and
  // redirects into the group.
  const context = await browser.newContext();
  await context.addInitScript(({ at, rt }) => {
    localStorage.setItem('ss_at', at);
    localStorage.setItem('ss_rt', rt);
  }, { at: joiner.accessToken, rt: joiner.refreshToken });
  const joinerPage = await context.newPage();
  await joinerPage.goto(`/g/${token}`);
  await expect(joinerPage.getByRole('heading', { name: groupName })).toBeVisible();
  await context.close();

  const detail = await apiJson(request, owner, 'GET', `/api/v1/groups/${groupId}`);
  const ids = detail.members.map((m) => m.user_id);
  expect(ids).toContain(joiner.id);
  expect(ids).toHaveLength(2);
});
