import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ActionIcon, Anchor, Avatar, Badge, Button, Card, CopyButton, Grid, Group, Loader,
  Modal, ScrollArea, SegmentedControl, Select, Skeleton, Stack, Table, Tabs, Text, TextInput, Title,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { api, fmt } from '../api.js';
import { Err } from '../auth.jsx';
import { Shell } from '../components/Shell.jsx';
import { Net, displayNameOf, initialsOf } from '../components/Net.jsx';
import { SettlementBox } from '../components/SettlementBox.jsx';
import { ExpenseForm, PaymentForm } from '../components/Forms.jsx';

export function GroupDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [detail, setDetail] = useState(null);
  const [ledger, setLedger] = useState(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [me, setMe] = useState(null);
  const [plan, setPlan] = useState(null);
  const [type, setType] = useState('all');
  const [q, setQ] = useState('');
  const [payer, setPayer] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fCat, setFCat] = useState('');
  const [fMin, setFMin] = useState('');
  const [fMax, setFMax] = useState('');
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');
  const [fSort, setFSort] = useState('newest');
  const [activity, setActivity] = useState([]);
  const [rules, setRules] = useState([]);
  const [setOpen, setSetOpen] = useState(false);
  const [renName, setRenName] = useState('');
  const [sBudget, setSBudget] = useState('');
  const [sAlert, setSAlert] = useState('80');
  const [sMode, setSMode] = useState('shared');
  const [sFee, setSFee] = useState('');
  const [saving, setSaving] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [showExp, setShowExp] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [payPreset, setPayPreset] = useState(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [e, setE] = useState(null);
  const isMobile = useMediaQuery('(max-width: 36em)');
  // Copy handoff from expense detail (task 4.1): opens the create form prefilled.
  const location = useLocation();
  const [copyFrom, setCopyFrom] = useState(() => location.state?.copyFrom ?? null);
  useEffect(() => {
    if (location.state?.copyFrom) {
      setCopyFrom(location.state.copyFrom);
      setShowExp(true);
      nav(location.pathname, { replace: true }); // consume: no stale copy on reload
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || '');

  const load = async () => {
    if (!validId) { setE({ message: 'Invalid group link.' }); return; }
    try {
      const [d, m, s, p] = await Promise.all([
        api.get(`/api/v1/groups/${id}`),
        api.get(`/api/v1/groups/${id}/me`),
        api.get(`/api/v1/groups/${id}/summary`),
        api.get(`/api/v1/groups/${id}/settlement`).catch(() => null),
      ]);
      setDetail(d); setMe(m); setSummary(s); if (p) setPlan(p); setE(null);
    } catch (err) { setE(err); }
  };
  const loadLedger = async () => {
    if (!validId) return;
    setLedgerLoading(true);
    try {
      const params = new URLSearchParams({ type, q, limit: '100' });
      if (payer) params.set('payer_id', payer);
      if (fStatus) params.set('status', fStatus);
      if (fCat) params.set('category', fCat);
      if (fMin !== '') params.set('min_amount', String(Math.round(Number(fMin) * 100)));
      if (fMax !== '') params.set('max_amount', String(Math.round(Number(fMax) * 100)));
      if (fFrom) params.set('from_date', new Date(`${fFrom}T00:00:00Z`).toISOString());
      if (fTo) params.set('to_date', new Date(`${fTo}T23:59:59Z`).toISOString());
      if (fSort === 'oldest') params.set('sort', 'created_at');
      setLedger(await api.get(`/api/v1/groups/${id}/ledger?${params.toString()}`));
    } catch (err) { setE(err); } finally { setLedgerLoading(false); }
  };
  const loadActivity = async () => {
    try { setActivity(await api.get(`/api/v1/groups/${id}/activity?limit=50`)); }
    catch (err) { setE(err); }
  };
  const loadRules = async () => {
    try { setRules(await api.get(`/api/v1/groups/${id}/recurring`)); }
    catch (err) { setE(err); }
  };
  const loadSummary = async () => {
    if (!validId) return;
    try {
      const [s, p] = await Promise.all([
        api.get(`/api/v1/groups/${id}/summary`),
        api.get(`/api/v1/groups/${id}/settlement`).catch(() => null),
      ]);
      setSummary(s); if (p) setPlan(p);
    } catch (err) { setE(err); }
  };
  useEffect(() => { load(); }, [id]);
  useEffect(() => { loadLedger(); }, [id, type]);

  const members = detail?.members || [];

  const remove = (uid, name) => {
    const mid = modals.openConfirmModal({
      title: 'Remove member',
      centered: true,
      children: <Text size="sm">Remove {name}? Blocked while they hold a balance. History is kept.</Text>,
      labels: { confirm: 'Remove', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        modals.updateModal(mid, { confirmProps: { color: 'red', loading: true } });
        try {
          await api.del(`/api/v1/groups/${id}/members/${uid}`);
          modals.closeModal(mid);
          load();
        } catch (err) {
          modals.closeModal(mid);
          setE(err);
        }
      },
    });
  };
  const leave = () => {
    const mid = modals.openConfirmModal({
      title: 'Leave group',
      centered: true,
      children: <Text size="sm">Leave this group? Blocked while you hold a balance.</Text>,
      labels: { confirm: 'Leave', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        modals.updateModal(mid, { confirmProps: { color: 'red', loading: true } });
        try { await api.post(`/api/v1/groups/${id}/leave`, {}); modals.closeModal(mid); nav('/'); }
        catch (err) { modals.closeModal(mid); setE(err); }
      },
    });
  };
  const delGroup = () => {
    const mid = modals.openConfirmModal({
      title: 'Delete group',
      centered: true,
      children: <Text size="sm">Delete “{detail?.name}”? Only possible when there are no expenses or everything is fully settled.</Text>,
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        modals.updateModal(mid, { confirmProps: { color: 'red', loading: true } });
        try { await api.del(`/api/v1/groups/${id}`); modals.closeModal(mid); nav('/'); }
        catch (err) { modals.closeModal(mid); setE(err); }
      },
    });
  };

  // Per-row copy / edit for expenses.
  const copyExpense = async (item) => {
    try {
      const d = await api.get(`/api/v1/expenses/${item.id}`);
      nav(`/groups/${id}`, { state: { copyFrom: d.expense } });
      setCopyFrom(d.expense);
      setShowExp(true);
    } catch (err) { setE(err); }
  };
  const editExpense = (item) => nav(`/groups/${id}/expenses/${item.id}`, { state: { openEdit: true } });

  const nudge = async (uid, name) => {
    try {
      await api.post(`/api/v1/groups/${id}/nudges`, { user_ids: [uid] });
      notifications.show({ title: `Nudged ${name}`, color: 'teal' });
      loadActivity();
    } catch (err) { setE(err); }
  };
  const reversePay = async (pid) => {
    try {
      await api.post(`/api/v1/payments/${pid}/reverse`, {});
      notifications.show({ title: 'Payment reversed', color: 'teal' });
      load(); loadLedger(); loadSummary();
    } catch (err) { setE(err); }
  };
  const setRole = async (uid, role) => {
    try {
      await api.patch(`/api/v1/groups/${id}/members/${uid}`, { role });
      notifications.show({ title: `Role → ${role}`, color: 'teal' });
      load();
    } catch (err) { setE(err); }
  };
  const setDeposit = async (uid, paid) => {
    try {
      await api.patch(`/api/v1/groups/${id}/members/${uid}/deposit`, { paid });
      load();
    } catch (err) { setE(err); }
  };
  const billFlatFee = async () => {
    try {
      const first = members[0]?.user_id;
      if (!first) return;
      await api.post(`/api/v1/groups/${id}/flat-fee`, { payer_id: first });
      notifications.show({ title: 'Flat fee billed', color: 'teal' });
      load(); loadLedger(); loadSummary();
    } catch (err) { setE(err); }
  };
  const exportCsv = async () => {
    try {
      const r = await fetch(`/api/v1/groups/${id}/export.csv`,
        { headers: { Authorization: `Bearer ${localStorage.getItem('ss_at')}` } });
      if (!r.ok) throw new Error(`export ${r.status}`);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${detail?.name || 'group'}-export.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { setE(err); }
  };
  const makeShareLink = async () => {
    try {
      const r = await api.post(`/api/v1/groups/${id}/share-link`, {});
      setShareLink(r.invite_link);
    } catch (err) { setE(err); }
  };
  const openSettings = () => {
    setRenName(detail?.name || '');
    setSBudget(detail?.budget ? (detail.budget.budget_cents / 100).toFixed(2) : '');
    setSAlert(String(detail?.budget?.alert_pct || 80));
    setSMode(detail?.mode || 'shared');
    setSFee(detail?.flat_fee_cents ? (detail.flat_fee_cents / 100).toFixed(2) : '');
    setSetOpen(true);
  };
  const saveSettings = async (ev) => {
    ev.preventDefault();
    setSaving(true);
    try {
      if (renName.trim() !== detail?.name) await api.patch(`/api/v1/groups/${id}`, { name: renName.trim() });
      const body = {};
      const initBudget = detail?.budget ? (detail.budget.budget_cents / 100).toFixed(2) : '';
      if (sBudget !== initBudget) body.budget = sBudget === '' ? 0 : Number(sBudget);
      if (sAlert !== String(detail?.budget?.alert_pct || 80)) body.budget_alert_pct = Number(sAlert) || 80;
      if (sMode !== (detail?.mode || 'shared')) body.mode = sMode;
      const initFee = detail?.flat_fee_cents ? (detail.flat_fee_cents / 100).toFixed(2) : '';
      if (sFee !== initFee) body.flat_fee = sFee === '' ? 0 : Number(sFee);
      if (Object.keys(body).length > 0) await api.patch(`/api/v1/groups/${id}/settings`, body);
      setSetOpen(false);
      load();
      notifications.show({ title: 'Group updated', color: 'teal' });
    } catch (err) { setE(err); } finally { setSaving(false); }
  };

  // Ledger totals over the loaded page.
  const totals = useMemo(() => {
    const items = ledger?.items || [];
    return {
      amount: items.reduce((a, t) => a + (t.amount_cents || 0), 0),
      mine: items.reduce((a, t) => a + (t.my_share_cents || 0), 0),
    };
  }, [ledger]);

  const payments = useMemo(
    () => (ledger?.items || []).filter((t) => t.kind === 'payment'),
    [ledger],
  );

  // Elegant balances: only debtors + who they transfer to (from settlement plan).
  const transfers = plan?.transfers || [];
  const byDebtor = useMemo(() => {
    const m = new Map();
    for (const t of transfers) {
      if (!m.has(t.from_user_id)) m.set(t.from_user_id, []);
      m.get(t.from_user_id).push(t);
    }
    return [...m.entries()];
  }, [transfers]);
  const debtors = useMemo(
    () => (summary || []).filter((x) => x.owe_cents > 0),
    [summary],
  );

  if (!detail) {
    return (
      <Shell>
        <Skeleton height={32} width="60%" radius="md" />
        <Stack gap="md" mt="md">
          <Skeleton height={52} radius="md" />
          <Skeleton height={180} radius="md" />
          <Skeleton height={120} radius="md" />
        </Stack>
        <Err e={e} />
      </Shell>
    );
  }

  return (
    <Shell>
      <Anchor component={Link} to="/" size="sm">← All groups</Anchor>
      <Group gap="sm" mt="xs" mb="xs">
        <Title order={2}>{detail.name}</Title>
        <Badge variant="light">{detail.currency}</Badge>
        {detail.my_role && <Badge variant="outline">{detail.my_role}</Badge>}
        {detail.mode && detail.mode !== 'shared' && <Badge variant="outline">{detail.mode}</Badge>}
      </Group>
      {me && <Net v={me.net_cents} c={detail.currency} />}
      {detail.budget && (
        <Card withBorder padding="sm" radius="md" mt="sm">
          <Group justify="space-between">
            <Text size="sm" fw={600}>
              Budget {fmt(detail.budget.spent_cents, detail.currency)} / {fmt(detail.budget.budget_cents, detail.currency)}
              {' '}({detail.budget.pct}%)
            </Text>
            {detail.budget.over
              ? <Badge color="red">over budget</Badge>
              : detail.budget.alert ? <Badge color="orange">alert threshold</Badge> : <Badge color="teal">on track</Badge>}
          </Group>
        </Card>
      )}
      <Group gap="xs" mt="sm">
        <Button size="xs" variant="default" onClick={() => nav(`/groups/${id}/statement`)}>Statement</Button>
        <Button size="xs" variant="default" onClick={() => nav(`/groups/${id}/report`)}>Report</Button>
        <Button size="xs" variant="default" onClick={exportCsv}>Export CSV</Button>
        {detail.my_role === 'owner' && (
          <>
            <Button size="xs" variant="default" onClick={openSettings}>Settings</Button>
            <Button size="xs" variant="default" onClick={makeShareLink}>Share link</Button>
          </>
        )}
        {detail.mode === 'event' && detail.flat_fee_cents > 0
          && (detail.my_role === 'owner' || detail.my_role === 'treasurer') && (
          <Button size="xs" variant="light" onClick={billFlatFee}>
            Bill flat fee ({fmt(detail.flat_fee_cents, detail.currency)})
          </Button>
        )}
      </Group>
      {shareLink && (
        <Card withBorder padding="sm" radius="md" mt="sm">
          <Text size="sm" c="dimmed">Public read-only page (names + totals only):</Text>
          <TextInput readOnly value={shareLink} mt="xs" />
          <CopyButton value={shareLink}>
            {({ copied, copy }) => (
              <Button size="xs" mt="xs" color={copied ? 'teal' : 'blue'} onClick={copy}>
                {copied ? 'Copied' : 'Copy link'}
              </Button>
            )}
          </CopyButton>
        </Card>
      )}
      <Err e={e} />

      <Stack gap="md" mt="md">
        <SettlementBox
          groupId={id}
          currency={detail.currency}
          members={members}
          onPay={(t) => { setPayPreset(t); setPayOpen(true); }}
        />

        <Group gap="sm">
          <Button onClick={() => { setPayPreset(null); setPayOpen(true); }}>Record payment</Button>
          <Button variant="light" onClick={() => setShowExp(!showExp)}>
            {showExp ? 'Close expense form' : '+ Expense'}
          </Button>
        </Group>

        {showExp && (
          <Card withBorder shadow="sm" padding="md" radius="md">
            <ExpenseForm
              groupId={id}
              members={members}
              copyFrom={copyFrom}
              onDone={() => { setShowExp(false); setCopyFrom(null); load(); loadLedger(); loadSummary(); }}
            />
          </Card>
        )}

        <Card withBorder shadow="sm" padding="md" radius="md">
          <Tabs defaultValue="ledger" onChange={(v) => {
            if (v === 'activity' && activity.length === 0) loadActivity();
            if (v === 'recurring' && rules.length === 0) loadRules();
          }}>
            <Tabs.List mb="sm">
              <Tabs.Tab value="ledger">Ledger</Tabs.Tab>
              <Tabs.Tab value="balances">Balances</Tabs.Tab>
              <Tabs.Tab value="paid">Total paid</Tabs.Tab>
              <Tabs.Tab value="share">Total share</Tabs.Tab>
              <Tabs.Tab value="payments">Payments</Tabs.Tab>
              <Tabs.Tab value="activity">Activity</Tabs.Tab>
              <Tabs.Tab value="recurring">Recurring</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="ledger">
          <Group justify="space-between" mb="sm">
            <Title order={4}>Ledger</Title>
            <Group gap="xs">
              {ledgerLoading && <Loader size="sm" />}
              {ledger && <Text size="sm" c="dimmed">{ledger.total} total</Text>}
            </Group>
          </Group>
          <form onSubmit={(ev) => { ev.preventDefault(); loadLedger(); }}>
            <Group gap="xs" mb="sm">
              <SegmentedControl
                size="xs"
                value={type}
                onChange={setType}
                data={[
                  { value: 'all', label: 'All' },
                  { value: 'expense', label: 'Expenses' },
                  { value: 'payment', label: 'Payments' },
                ]}
              />
              <Select
                size="xs"
                placeholder="Filter by payer / party"
                clearable
                value={payer}
                onChange={(v) => setPayer(v || '')}
                data={members.map((m) => ({ value: m.user_id, label: m.display_name }))}
                style={{ minWidth: 170 }}
              />
              <TextInput
                size="xs"
                placeholder="Search item or payer"
                value={q}
                onChange={(x) => setQ(x.target.value)}
                style={{ flex: 1 }}
              />
              <Button size="xs" variant="default" onClick={loadLedger} loading={ledgerLoading}>Go</Button>
            </Group>
            <Group gap="xs" mb="sm">
              <Select size="xs" placeholder="Status" clearable value={fStatus} onChange={(v) => setFStatus(v || '')} data={['OPEN', 'LOCKED']} style={{ width: 110 }} />
              <Select size="xs" placeholder="Category" clearable value={fCat} onChange={(v) => setFCat(v || '')}
                data={['food', 'transport', 'stay', 'activity', 'shopping', 'health', 'bills', 'other']} style={{ width: 130 }} />
              <TextInput size="xs" placeholder="Min $" inputMode="decimal" value={fMin} onChange={(x) => setFMin(x.target.value)} style={{ width: 80 }} />
              <TextInput size="xs" placeholder="Max $" inputMode="decimal" value={fMax} onChange={(x) => setFMax(x.target.value)} style={{ width: 80 }} />
              <TextInput size="xs" type="date" value={fFrom} onChange={(x) => setFFrom(x.target.value)} style={{ width: 135 }} />
              <TextInput size="xs" type="date" value={fTo} onChange={(x) => setFTo(x.target.value)} style={{ width: 135 }} />
              <Select size="xs" value={fSort} onChange={setFSort} data={[{ value: 'newest', label: 'Newest' }, { value: 'oldest', label: 'Oldest' }]} style={{ width: 100 }} />
            </Group>
          </form>
          <ScrollArea>
          <Table striped highlightOnHover withTableBorder miw={640}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Item</Table.Th>
                <Table.Th>Payer / Parties</Table.Th>
                <Table.Th>Amount</Table.Th>
                <Table.Th>My share</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th></Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {ledger?.items.map((t) => (
                <Table.Tr key={t.id}>
                  <Table.Td>
                    {t.kind === 'expense' ? (
                      <Anchor component={Link} to={`/groups/${id}/expenses/${t.id}`}>{t.title}</Anchor>
                    ) : (
                      t.title
                    )}
                    {t.has_image && <Text span size="sm"> 🧾</Text>}
                    {t.reversed && <Text span size="xs" c="dimmed"> (reversed)</Text>}
                  </Table.Td>
                  <Table.Td>
                    {t.kind === 'expense'
                      ? (t.payer_name || displayNameOf(members, t.payer_id))
                      : `${t.from_name || t.from_user_id?.slice(0, 8)} → ${t.to_name || t.to_user_id?.slice(0, 8)}`}
                  </Table.Td>
                  <Table.Td>{fmt(t.amount_cents, detail.currency)}</Table.Td>
                  <Table.Td>{t.my_share_cents != null ? fmt(t.my_share_cents, detail.currency) : '—'}</Table.Td>
                  <Table.Td>
                    <Badge size="sm" color={t.status === 'LOCKED' ? 'gray' : 'teal'} variant="light">
                      {t.status}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    {t.kind === 'expense' && (
                      <Group gap={2} wrap="nowrap">
                        <ActionIcon size="sm" variant="subtle" title="Copy expense" aria-label={`Copy ${t.title}`} onClick={() => copyExpense(t)}>⧉</ActionIcon>
                        <ActionIcon size="sm" variant="subtle" title="Edit expense" aria-label={`Edit ${t.title}`} onClick={() => editExpense(t)}>✎</ActionIcon>
                      </Group>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
            <Table.Tfoot>
              <Table.Tr>
                <Table.Td><Text size="sm" fw={600}>Total ({ledger?.items.length || 0} rows)</Text></Table.Td>
                <Table.Td />
                <Table.Td><Text size="sm" fw={600}>{fmt(totals.amount, detail.currency)}</Text></Table.Td>
                <Table.Td><Text size="sm" fw={600}>{fmt(totals.mine, detail.currency)}</Text></Table.Td>
                <Table.Td />
                <Table.Td />
              </Table.Tr>
            </Table.Tfoot>
          </Table>
          </ScrollArea>
            </Tabs.Panel>

            <Tabs.Panel value="balances">
              <Title order={4} mb="sm">Who owes</Title>
              {debtors.length === 0 && transfers.length === 0 && (
                <Text c="dimmed" size="sm">All settled — nobody owes anything. 🎉</Text>
              )}
              <Stack gap="sm">
                {byDebtor.map(([from, list]) => (
                  <Card key={from} withBorder radius="md" padding="sm">
                    <Group gap="sm" wrap="nowrap">
                      <Avatar color="red" radius="xl" size="sm">{initialsOf(displayNameOf(members, from))}</Avatar>
                      <div style={{ flex: 1 }}>
                        <Group gap="xs">
                          <Text size="sm" fw={600}>{displayNameOf(members, from)} owes</Text>
                          <Button size="xs" variant="subtle" onClick={() => nudge(from, displayNameOf(members, from))}>Nudge</Button>
                        </Group>
                        {list.map((t, i) => (
                          <Group key={i} gap="xs" mt={2}>
                            <Text size="sm">
                              → {displayNameOf(members, t.to_user_id)} <b>{fmt(t.amount_cents, detail.currency)}</b>
                            </Text>
                            <Button size="xs" variant="light" onClick={() => { setPayPreset(t); setPayOpen(true); }}>Pay</Button>
                          </Group>
                        ))}
                      </div>
                    </Group>
                  </Card>
                ))}
                {byDebtor.length === 0 && debtors.map((m) => (
                  <Card key={m.user_id} withBorder radius="md" padding="sm">
                    <Group gap="xs">
                      <Text size="sm"><b>{m.display_name}</b> owes <b>{fmt(m.owe_cents, detail.currency)}</b></Text>
                      <Button size="xs" variant="subtle" onClick={() => nudge(m.user_id, m.display_name)}>Nudge</Button>
                    </Group>
                  </Card>
                ))}
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="paid">
              <Title order={4} mb="sm">Total paid</Title>
              <ScrollArea>
              <Table striped highlightOnHover withTableBorder miw={400}>
                <Table.Thead>
                  <Table.Tr><Table.Th>Member</Table.Th><Table.Th>Total paid</Table.Th></Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {[...(summary || [])].sort((a, b) => b.total_paid_cents - a.total_paid_cents).map((m) => (
                    <Table.Tr key={m.user_id}>
                      <Table.Td>{m.display_name}</Table.Td>
                      <Table.Td>{fmt(m.total_paid_cents, detail.currency)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
                <Table.Tfoot>
                  <Table.Tr>
                    <Table.Td><Text size="sm" fw={600}>Total</Text></Table.Td>
                    <Table.Td><Text size="sm" fw={600}>{fmt((summary || []).reduce((a, m) => a + m.total_paid_cents, 0), detail.currency)}</Text></Table.Td>
                  </Table.Tr>
                </Table.Tfoot>
              </Table>
              </ScrollArea>
            </Tabs.Panel>

            <Tabs.Panel value="share">
              <Title order={4} mb="sm">Total share</Title>
              <ScrollArea>
              <Table striped highlightOnHover withTableBorder miw={400}>
                <Table.Thead>
                  <Table.Tr><Table.Th>Member</Table.Th><Table.Th>Total share</Table.Th></Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {[...(summary || [])].sort((a, b) => b.total_share_cents - a.total_share_cents).map((m) => (
                    <Table.Tr key={m.user_id}>
                      <Table.Td>{m.display_name}</Table.Td>
                      <Table.Td>{fmt(m.total_share_cents, detail.currency)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
                <Table.Tfoot>
                  <Table.Tr>
                    <Table.Td><Text size="sm" fw={600}>Total</Text></Table.Td>
                    <Table.Td><Text size="sm" fw={600}>{fmt((summary || []).reduce((a, m) => a + m.total_share_cents, 0), detail.currency)}</Text></Table.Td>
                  </Table.Tr>
                </Table.Tfoot>
              </Table>
              </ScrollArea>
            </Tabs.Panel>

            <Tabs.Panel value="payments">
              <Group justify="space-between" mb="sm">
                <Title order={4}>Transfer history</Title>
                <Text size="sm" c="dimmed">Kept forever — stays visible after settle-up</Text>
              </Group>
              {payments.length === 0 && <Text size="sm" c="dimmed">No transfers yet.</Text>}
              <Stack gap="xs">
                {payments.map((p) => (
                  <Card key={p.id} withBorder radius="md" padding="sm">
                    <Group justify="space-between" wrap="nowrap">
                      <Text size="sm">
                        {p.from_name || p.from_user_id?.slice(0, 8)} → {p.to_name || p.to_user_id?.slice(0, 8)}:{' '}
                        <b>{fmt(p.amount_cents, detail.currency)}</b>{' '}
                        <Text span size="xs" c="dimmed">
                          {new Date(p.created_at).toLocaleString()}{p.reversed ? ' · reversed' : ''} · {p.status}
                        </Text>
                      </Text>
                      {!p.reversed && p.status === 'OPEN' && (
                        <Button size="xs" variant="subtle" onClick={() => reversePay(p.id)}>Reverse</Button>
                      )}
                    </Group>
                  </Card>
                ))}
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="activity">
              <Group justify="space-between" mb="sm">
                <Title order={4}>Activity</Title>
                <Button size="xs" variant="default" onClick={loadActivity}>Refresh</Button>
              </Group>
              {activity.length === 0 && <Text size="sm" c="dimmed">Nothing yet — load to catch up.</Text>}
              <Stack gap="xs">
                {activity.map((a, i) => (
                  <Group key={i} gap="xs" wrap="nowrap">
                    <Badge size="xs" variant="light">{a.kind}</Badge>
                    <Text size="sm">{a.text} <Text span size="xs" c="dimmed">{new Date(a.at).toLocaleString()}</Text></Text>
                  </Group>
                ))}
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="recurring">
              <Group justify="space-between" mb="sm">
                <Title order={4}>Recurring bills</Title>
                <Button size="xs" variant="default" onClick={loadRules}>Refresh</Button>
              </Group>
              <RecurringForm groupId={id} members={members} onDone={loadRules} />
              <Stack gap="xs" mt="sm">
                {rules.map((r) => (
                  <Card key={r.rule_id} withBorder radius="md" padding="sm">
                    <Group justify="space-between" wrap="nowrap">
                      <div>
                        <Text size="sm" fw={600}>{r.title} <Text span c="dimmed">· {r.frequency} · next {new Date(r.next_run_at).toLocaleDateString()}</Text></Text>
                        <Text size="xs" c="dimmed">{fmt(r.amount_cents, detail.currency)} · {r.active ? 'active' : 'paused'}</Text>
                      </div>
                      <Group gap="xs">
                        <Button size="xs" variant="subtle" onClick={async () => { await api.patch(`/api/v1/groups/${id}/recurring/${r.rule_id}`, { active: !r.active }); loadRules(); }}>
                          {r.active ? 'Pause' : 'Resume'}
                        </Button>
                        <Button size="xs" variant="subtle" color="red" onClick={async () => { await api.del(`/api/v1/groups/${id}/recurring/${r.rule_id}`); loadRules(); }}>Delete</Button>
                      </Group>
                    </Group>
                  </Card>
                ))}
                {rules.length === 0 && <Text size="sm" c="dimmed">No rules — add rent, wifi, subscriptions.</Text>}
              </Stack>
            </Tabs.Panel>
          </Tabs>
        </Card>

        <Grid>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Card withBorder shadow="sm" padding="md" radius="md" h="100%">
              <Title order={4} mb="sm">Members</Title>
              <Stack gap="xs">
                {members.map((m) => (
                  <Group key={m.user_id} justify="space-between" wrap="nowrap">
                    <Group gap="sm" wrap="nowrap">
                      <Avatar color="teal" radius="xl" size="sm">{initialsOf(m.display_name)}</Avatar>
                      <div>
                        <Text size="sm" fw={500}>
                          {m.display_name}
                          {detail.mode === 'event' && (
                            <Text span size="xs" c={m.deposit_paid ? 'teal' : 'dimmed'}>
                              {' '}· {m.deposit_paid ? 'deposit ✓' : 'deposit due'}
                            </Text>
                          )}
                        </Text>
                        <Text size="xs" c="dimmed">@{m.username} · {m.role}</Text>
                      </div>
                    </Group>
                    <Group gap={2} wrap="nowrap">
                      {detail.mode === 'event' && (
                        <Button size="xs" variant="subtle" title="Toggle deposit" onClick={() => setDeposit(m.user_id, !m.deposit_paid)}>
                          {m.deposit_paid ? 'Unmark' : 'Paid'}
                        </Button>
                      )}
                      {detail.my_role === 'owner' && m.role !== 'owner' && (
                        <Button size="xs" variant="subtle" title="Toggle treasurer" onClick={() => setRole(m.user_id, m.role === 'treasurer' ? 'member' : 'treasurer')}>
                          {m.role === 'treasurer' ? 'Untreasurer' : 'Treasurer'}
                        </Button>
                      )}
                      {detail.my_role === 'owner' && (
                        <Button size="xs" variant="subtle" color="red" mih={44} onClick={() => remove(m.user_id, m.display_name)}>
                          Remove
                        </Button>
                      )}
                    </Group>
                  </Group>
                ))}
              </Stack>
              <Button fullWidth variant="light" color="red" mt="md" onClick={leave}>
                Leave group
              </Button>
              {detail.my_role === 'owner' && (
                <Button fullWidth variant="outline" color="red" mt="sm" onClick={delGroup}>
                  Delete group
                </Button>
              )}
            </Card>
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Card withBorder shadow="sm" padding="md" radius="md" h="100%">
              <Title order={4} mb="sm">Invite</Title>
              <Text size="sm" c="dimmed" mb="sm">Invite several people at once, or share a link.</Text>
              <Button fullWidth onClick={() => nav(`/groups/${id}/invite`)}>
                Invite members
              </Button>
            </Card>
          </Grid.Col>
        </Grid>
      </Stack>

      <Modal opened={payOpen} onClose={() => setPayOpen(false)} title="Record payment" centered fullScreen={isMobile}>
        <PaymentForm
          groupId={id}
          members={members}
          preset={payPreset}
          onDone={(r) => {
            setPayOpen(false);
            setPayPreset(null);
            load();
            loadLedger();
            loadSummary();
            notifications.show({
              title: r.fully_settled ? 'Fully settled' : 'Payment recorded',
              color: 'teal',
            });
          }}
        />
      </Modal>

      <Modal opened={inviteOpen} onClose={() => setInviteOpen(false)} title="New invite link" centered fullScreen={isMobile}>
        <Text size="sm" c="dimmed" mb="xs">The old link is dead. Share this one:</Text>
        <TextInput readOnly value={inviteLink} />
        <CopyButton value={inviteLink}>
          {({ copied, copy }) => (
            <Button fullWidth mt="sm" color={copied ? 'teal' : 'blue'} onClick={copy}>
              {copied ? 'Copied' : 'Copy link'}
            </Button>
          )}
        </CopyButton>
      </Modal>

      <Modal opened={setOpen} onClose={() => setSetOpen(false)} title="Group settings" centered fullScreen={isMobile}>
        <form onSubmit={saveSettings}>
          <Stack gap="sm">
            <TextInput label="Group name" required value={renName} onChange={(x) => setRenName(x.target.value)} />
            <TextInput label="Budget (0 clears)" inputMode="decimal" value={sBudget} onChange={(x) => setSBudget(x.target.value)} />
            <TextInput label="Alert at %" inputMode="numeric" value={sAlert} onChange={(x) => setSAlert(x.target.value)} />
            <Select label="Mode" value={sMode} onChange={setSMode} data={['shared', 'trip', 'event']} />
            <TextInput label="Flat fee per head, event mode (0 clears)" inputMode="decimal" value={sFee} onChange={(x) => setSFee(x.target.value)} />
            <Button type="submit" loading={saving}>Save</Button>
            <Err e={e} />
          </Stack>
        </form>
      </Modal>
    </Shell>
  );
}

function RecurringForm({ groupId, members, onDone }) {
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [payer, setPayer] = useState(members[0]?.user_id || '');
  const [freq, setFreq] = useState('monthly');
  const [e, setE] = useState(null);
  const [busy, setBusy] = useState(false);
  const go = async (ev) => {
    ev.preventDefault();
    setBusy(true);
    try {
      await api.post(`/api/v1/groups/${groupId}/recurring`, {
        title, amount: Number(amount), split_type: 'EQUAL', payer_id: payer,
        participant_ids: members.map((m) => m.user_id), frequency: freq,
      });
      setTitle(''); setAmount('');
      onDone();
    } catch (err) { setE(err); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={go}>
      <Group gap="xs" align="flex-end">
        <TextInput label="Title" required placeholder="Rent" value={title} onChange={(x) => setTitle(x.target.value)} style={{ flex: 2 }} />
        <TextInput label="Amount" required inputMode="decimal" value={amount} onChange={(x) => setAmount(x.target.value)} style={{ flex: 1 }} />
        <Select label="Payer" value={payer} onChange={setPayer} data={members.map((m) => ({ value: m.user_id, label: m.display_name }))} style={{ flex: 2 }} />
        <Select label="Every" value={freq} onChange={setFreq} data={['weekly', 'monthly']} style={{ width: 110 }} />
        <Button type="submit" loading={busy}>Add</Button>
      </Group>
      <Err e={e} />
    </form>
  );
}
