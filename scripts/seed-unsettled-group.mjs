#!/usr/bin/env node
/**
 * Seed a new unsettled group for UI testing.
 * Usage: node scripts/seed-unsettled-group.mjs [API_BASE]
 * Default API: http://localhost:8081
 *
 * Optional: ATTACH_USERNAMES=anhnguyen,long.chang
 *   After seeding, add those existing users as members so the group
 *   shows up on their Groups list (without changing the 5 seed accounts).
 */
const API = (process.argv[2] || process.env.API_URL || 'http://localhost:8081').replace(/\/$/, '');
const PASSWORD = 'Password1!';
const ATTACH = (process.env.ATTACH_USERNAMES || 'anhnguyen')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const stamp = Date.now().toString(36).slice(-6);

const PEOPLE = [
  { username: `open_mai_${stamp}`, email: `open.mai.${stamp}@example.com`, display_name: 'Mai Nguyen' },
  { username: `open_khoa_${stamp}`, email: `open.khoa.${stamp}@example.com`, display_name: 'Khoa Tran' },
  { username: `open_lan_${stamp}`, email: `open.lan.${stamp}@example.com`, display_name: 'Lan Pham' },
  { username: `open_hung_${stamp}`, email: `open.hung.${stamp}@example.com`, display_name: 'Hung Le' },
  { username: `open_vy_${stamp}`, email: `open.vy.${stamp}@example.com`, display_name: 'Vy Do' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, { method = 'GET', token, body, retries = 4 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    if (res.status === 429 && attempt < retries) {
      await sleep(800 * (attempt + 1));
      continue;
    }
    if (!res.ok) {
      const err = new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 400)}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }
}

async function attachExistingUsers(groupId, usernames) {
  if (!usernames.length) return [];
  const { execFileSync } = await import('node:child_process');
  const list = usernames.map((u) => `'${u.replace(/'/g, "''")}'`).join(',');
  const sql = `
SET search_path TO splitshare;
INSERT INTO "GroupMembers" ("GroupId", "UserId", "Role", "JoinedAt", "DepositPaid")
SELECT '${groupId}'::uuid, u."Id", 'member', NOW(), false
FROM "Users" u
WHERE u."Username" IN (${list})
  AND NOT EXISTS (
    SELECT 1 FROM "GroupMembers" m
    WHERE m."GroupId" = '${groupId}'::uuid AND m."UserId" = u."Id"
  );
SELECT u."Username" FROM "Users" u
JOIN "GroupMembers" m ON m."UserId" = u."Id"
WHERE m."GroupId" = '${groupId}'::uuid AND u."Username" IN (${list});
`;
  try {
    const out = execFileSync(
      'psql',
      ['-h', process.env.PGHOST || 'localhost', '-U', process.env.PGUSER || 'module_platform',
        '-d', process.env.PGDATABASE || 'splitshare', '-t', '-A', '-c', sql],
      {
        env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || 'module_platform' },
        encoding: 'utf8',
      },
    );
    return out.split('\n').map((s) => s.trim()).filter(Boolean);
  } catch (e) {
    console.warn(`  Attach via DB failed: ${e.message.slice(0, 160)}`);
    return [];
  }
}

async function ensureUser(person) {
  try {
    const reg = await api('/api/v1/auth/register', {
      method: 'POST',
      body: {
        username: person.username,
        email: person.email,
        display_name: person.display_name,
        password: PASSWORD,
      },
    });
    await sleep(350);
    return { ...person, user_id: reg.user.user_id, token: reg.access_token };
  } catch (e) {
    if (e.status !== 422 && e.status !== 409) throw e;
    const login = await api('/api/v1/auth/login', {
      method: 'POST',
      body: { username_or_email: person.username, password: PASSWORD },
    });
    return { ...person, user_id: login.user.user_id, token: login.access_token };
  }
}

async function main() {
  console.log(`Seeding unsettled group via ${API}…`);
  const users = [];
  for (const p of PEOPLE) users.push(await ensureUser(p));

  const owner = users[0];
  const memberIds = users.slice(1).map((u) => u.user_id);

  const created = await api('/api/v1/groups', {
    method: 'POST',
    token: owner.token,
    body: {
      name: `Da Nang Open ${stamp}`,
      currency: 'USD',
      member_ids: memberIds,
    },
  });
  const groupId = created.group.id;
  const ids = users.map((u) => u.user_id);
  const [mai, khoa, lan, hung, vy] = ids;

  const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

  const expenses = [
    {
      title: 'Dinner Hai San Be',
      amount: 186.5,
      payer_id: mai,
      split_type: 'EQUAL',
      participant_ids: ids,
      category: 'food',
      spent_at: daysAgo(6),
      tip: 15,
    },
    {
      title: 'Grab car Da Nang → Hoi An',
      amount: 42,
      payer_id: khoa,
      split_type: 'EQUAL',
      participant_ids: [mai, khoa, lan, hung],
      category: 'transport',
      spent_at: daysAgo(5),
    },
    {
      title: 'Airbnb 2 nights',
      amount: 320,
      payer_id: lan,
      split_type: 'SHARES',
      participant_ids: ids,
      shares: ids.map((id) => ({ user_id: id, shares: id === lan || id === mai ? 2 : 1 })),
      category: 'stay',
      spent_at: daysAgo(5),
    },
    {
      title: 'Cafe + bakery',
      amount: 38.75,
      payer_id: hung,
      split_type: 'EQUAL',
      participant_ids: [hung, vy, mai],
      category: 'food',
      spent_at: daysAgo(4),
    },
    {
      title: 'Snorkel tickets',
      amount: 95,
      payer_id: vy,
      split_type: 'EXACT',
      participant_ids: [vy, khoa, lan],
      exact: [
        { user_id: vy, amount_cents: 4500 },
        { user_id: khoa, amount_cents: 2500 },
        { user_id: lan, amount_cents: 2500 },
      ],
      category: 'activity',
      spent_at: daysAgo(3),
    },
    {
      title: 'Groceries Big C',
      amount: 67.2,
      payer_id: mai,
      split_type: 'PERCENT',
      participant_ids: ids,
      percent: [
        { user_id: mai, percent: 30 },
        { user_id: khoa, percent: 20 },
        { user_id: lan, percent: 20 },
        { user_id: hung, percent: 15 },
        { user_id: vy, percent: 15 },
      ],
      category: 'shopping',
      spent_at: daysAgo(2),
    },
    {
      title: 'Pharmacy / meds',
      amount: 24.5,
      payer_id: khoa,
      split_type: 'EQUAL',
      participant_ids: [khoa, hung],
      category: 'health',
      spent_at: daysAgo(1),
    },
  ];

  const expenseIds = [];
  for (const exp of expenses) {
    const r = await api(`/api/v1/groups/${groupId}/expenses`, {
      method: 'POST',
      token: owner.token,
      body: exp,
    });
    const eid = r.expense?.expense_id || r.expense?.id || r.expense_id;
    if (eid) expenseIds.push(eid);
    else console.warn('Expense created without id', r);
  }

  // Partial repayment — leaves group still unsettled.
  await api(`/api/v1/groups/${groupId}/payments`, {
    method: 'POST',
    token: users[1].token,
    body: {
      from_user_id: khoa,
      to_user_id: mai,
      amount: 25,
      method: 'transfer',
      note: 'Partial dinner share',
      proof_ref: 'TXN-SEED-001',
    },
  });

  await api(`/api/v1/groups/${groupId}/payments`, {
    method: 'POST',
    token: users[4].token,
    body: {
      from_user_id: vy,
      to_user_id: lan,
      amount: 18.5,
      method: 'cash',
      note: 'Airbnb kick-in',
    },
  });

  if (expenseIds[0]) {
    await api(`/api/v1/expenses/${expenseIds[0]}/comments`, {
      method: 'POST',
      token: users[2].token,
      body: { body: 'Receipt is on the table group chat — tip was included.' },
    });
    await api(`/api/v1/expenses/${expenseIds[0]}/comments`, {
      method: 'POST',
      token: owner.token,
      body: { body: 'Thanks — I split tip equally across everyone.' },
    });
  }
  if (expenseIds[2]) {
    await api(`/api/v1/expenses/${expenseIds[2]}/comments`, {
      method: 'POST',
      token: users[3].token,
      body: { body: 'Can we keep the Airbnb receipt for the report?' },
    });
  }

  try {
    await api(`/api/v1/groups/${groupId}/nudges`, {
      method: 'POST',
      token: owner.token,
      body: { user_ids: [hung, khoa] },
    });
  } catch (e) {
    console.warn('Nudge skipped:', e.message);
  }

  const attached = await attachExistingUsers(groupId, ATTACH);

  const settlement = await api(`/api/v1/groups/${groupId}/settlement`, { token: owner.token });
  const transfers = settlement.transfers || [];

  console.log('\n✅ Unsettled group ready\n');
  console.log(`  Group:     ${created.group.name}`);
  console.log(`  Group ID:  ${groupId}`);
  console.log(`  Open URL:  http://localhost:3000/groups/${groupId}`);
  console.log(`  Invite:    ${created.invite_link}`);
  console.log(`  Members:   ${users.map((u) => u.display_name).join(', ')}`);
  if (attached.length) console.log(`  Attached:  ${attached.join(', ')}`);
  console.log(`  Login as:  ${owner.username} / ${PASSWORD}`);
  console.log(`  Expenses:  ${expenseIds.length}`);
  console.log(`  Transfers needed: ${transfers.length} (should be > 0)`);
  if (transfers.length === 0) {
    console.warn('  ⚠️  Settlement shows 0 transfers — group may appear settled.');
  } else {
    for (const t of transfers.slice(0, 8)) {
      const from = users.find((u) => u.user_id === t.from_user_id)?.display_name || t.from_user_id;
      const to = users.find((u) => u.user_id === t.to_user_id)?.display_name || t.to_user_id;
      console.log(`    • ${from} → ${to}: $${(t.amount_cents / 100).toFixed(2)}`);
    }
  }
}

main().catch((err) => {
  console.error('\nSeed failed:', err.message);
  process.exit(1);
});
