import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ActionIcon, Anchor, Avatar, Badge, Button, Card, CopyButton, Grid, Group, Loader,
  Modal, ScrollArea, SegmentedControl, Skeleton, Stack, Table, Tabs, Text, TextInput, Title,
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
  const [type, setType] = useState('all');
  const [q, setQ] = useState('');
  const [showExp, setShowExp] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [payPreset, setPayPreset] = useState(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [email, setEmail] = useState('');
  const [cq, setCq] = useState('');
  const [contacts, setContacts] = useState([]);
  const [e, setE] = useState(null);
  const [inviting, setInviting] = useState(false);
  const [searching, setSearching] = useState(false);
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
      const [d, m, s] = await Promise.all([
        api.get(`/api/v1/groups/${id}`),
        api.get(`/api/v1/groups/${id}/me`),
        api.get(`/api/v1/groups/${id}/summary`),
      ]);
      setDetail(d); setMe(m); setSummary(s); setE(null);
    } catch (err) { setE(err); }
  };
  const loadLedger = async () => {
    if (!validId) return;
    setLedgerLoading(true);
    try {
      setLedger(await api.get(`/api/v1/groups/${id}/ledger?type=${type}&q=${encodeURIComponent(q)}`));
    } catch (err) { setE(err); } finally { setLedgerLoading(false); }
  };
  const loadSummary = async () => {
    if (!validId) return;
    try {
      setSummary(await api.get(`/api/v1/groups/${id}/summary`));
    } catch (err) { setE(err); }
  };
  useEffect(() => { load(); }, [id]);
  useEffect(() => { loadLedger(); }, [id, type]);

  const members = detail?.members || [];

  const invite = async (ev) => {
    ev.preventDefault();
    if (inviting) return;
    setInviting(true);
    try {
      const r = await api.post(`/api/v1/groups/${id}/invites`, { emails: [email] });
      notifications.show({ title: 'Invite sent', message: `added: ${r.added} pending: ${r.pending}`, color: 'teal' });
      setEmail('');
      load();
    } catch (err) { setE(err); } finally { setInviting(false); }
  };
  const searchContacts = async (ev) => {
    ev.preventDefault();
    if (searching) return;
    setSearching(true);
    try { setContacts(await api.get(`/api/v1/contacts?q=${encodeURIComponent(cq)}`)); }
    catch (err) { setE(err); } finally { setSearching(false); }
  };
  const addMember = async (uid) => {
    try {
      await api.post(`/api/v1/groups/${id}/members`, { user_ids: [uid] });
      notifications.show({ title: 'Member added', color: 'teal' });
      load();
    } catch (err) { setE(err); }
  };
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
  const rotate = async () => {
    try {
      const r = await api.post(`/api/v1/groups/${id}/rotate-invite`, {});
      setInviteLink(r.invite_link);
      setInviteOpen(true);
    } catch (err) { setE(err); }
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
      </Group>
      {me && <Net v={me.net_cents} c={detail.currency} />}
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
          <Tabs defaultValue="ledger">
            <Tabs.List mb="sm">
              <Tabs.Tab value="ledger">Ledger</Tabs.Tab>
              <Tabs.Tab value="balances">Balances</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="ledger">
          <Group justify="space-between" mb="sm">
            <Title order={4}>Ledger</Title>
            <Group gap="xs">
              {ledgerLoading && <Loader size="sm" />}
              {ledger && <Text size="sm" c="dimmed">{ledger.total} total</Text>}
            </Group>
          </Group>
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
            <TextInput
              size="xs"
              placeholder="Search"
              value={q}
              onChange={(x) => setQ(x.target.value)}
              style={{ flex: 1 }}
            />
            <Button size="xs" variant="default" onClick={loadLedger} loading={ledgerLoading}>Go</Button>
          </Group>
          <ScrollArea>
          <Table striped highlightOnHover withTableBorder miw={560}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Item</Table.Th>
                <Table.Th>Payer / Parties</Table.Th>
                <Table.Th>Amount</Table.Th>
                <Table.Th>My share</Table.Th>
                <Table.Th>Status</Table.Th>
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
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          </ScrollArea>
            </Tabs.Panel>

            <Tabs.Panel value="balances">
              <Text size="xs" c="dimmed" mb="sm">
                Paid = expense totals paid (all non-deleted expenses) · Owe = current net debt
              </Text>
              <ScrollArea>
              <Table striped highlightOnHover withTableBorder miw={520}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Member</Table.Th>
                    <Table.Th>Total paid</Table.Th>
                    <Table.Th>Share</Table.Th>
                    <Table.Th>Owe</Table.Th>
                    <Table.Th>Net</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {summary?.map((m) => (
                    <Table.Tr key={m.user_id}>
                      <Table.Td>{m.display_name}</Table.Td>
                      <Table.Td>{fmt(m.total_paid_cents, detail.currency)}</Table.Td>
                      <Table.Td>{fmt(m.total_share_cents, detail.currency)}</Table.Td>
                      <Table.Td>{m.owe_cents > 0 ? fmt(m.owe_cents, detail.currency) : '—'}</Table.Td>
                      <Table.Td>
                        {m.net_cents === 0 ? 'settled' : (
                          <Text span c={m.net_cents < 0 ? 'red' : 'teal'}>
                            {fmt(m.net_cents, detail.currency)}
                          </Text>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
              </ScrollArea>
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
                        <Text size="sm" fw={500}>{m.display_name}</Text>
                        <Text size="xs" c="dimmed">@{m.username} · {m.role}</Text>
                      </div>
                    </Group>
                    {detail.my_role === 'owner' && (
                      <Button size="xs" variant="subtle" color="red" mih={44} onClick={() => remove(m.user_id, m.display_name)}>
                        Remove
                      </Button>
                    )}
                  </Group>
                ))}
              </Stack>
              <Button fullWidth variant="light" color="red" mt="md" onClick={leave}>
                Leave group
              </Button>
            </Card>
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Card withBorder shadow="sm" padding="md" radius="md" h="100%">
              <Title order={4} mb="sm">Invite</Title>
              <form onSubmit={invite}>
                <Group gap="xs" align="flex-end">
                  <TextInput
                    label="Invite by email"
                    placeholder="friend@example.com"
                    value={email}
                    onChange={(x) => setEmail(x.target.value)}
                    style={{ flex: 1 }}
                  />
                  <Button type="submit" loading={inviting}>Invite</Button>
                </Group>
              </form>
              <form onSubmit={searchContacts}>
                <Group gap="xs" mt="sm" align="flex-end">
                  <TextInput
                    label="Add from contacts"
                    placeholder="Search name, username, email"
                    value={cq}
                    onChange={(x) => setCq(x.target.value)}
                    style={{ flex: 1 }}
                  />
                  <Button type="submit" variant="default" loading={searching}>Search</Button>
                </Group>
              </form>
              <Stack gap="xs" mt="sm">
                {contacts.map((c) => (
                  <Group key={c.user_id} justify="space-between" wrap="nowrap">
                    <Group gap="sm" wrap="nowrap">
                      <Avatar color="blue" radius="xl" size="sm">{initialsOf(c.display_name)}</Avatar>
                      <Text size="sm">{c.display_name} <Text span c="dimmed">@{c.username}</Text></Text>
                    </Group>
                    <ActionIcon variant="light" title="Add to group" onClick={() => addMember(c.user_id)}>
                      +
                    </ActionIcon>
                  </Group>
                ))}
              </Stack>
              {detail.my_role === 'owner' && (
                <Button fullWidth variant="default" mt="md" onClick={rotate}>
                  New invite link (rotates)
                </Button>
              )}
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
    </Shell>
  );
}
