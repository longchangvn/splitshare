import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ActionIcon, Anchor, Avatar, Badge, Button, Card, CopyButton, Grid, Group,
  Modal, SegmentedControl, Stack, Table, Text, TextInput, Title,
} from '@mantine/core';
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

  const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || '');

  const load = async () => {
    if (!validId) { setE({ message: 'Invalid group link.' }); return; }
    try {
      const [d, m] = await Promise.all([
        api.get(`/api/v1/groups/${id}`),
        api.get(`/api/v1/groups/${id}/me`),
      ]);
      setDetail(d); setMe(m); setE(null);
    } catch (err) { setE(err); }
  };
  const loadLedger = async () => {
    if (!validId) return;
    try {
      setLedger(await api.get(`/api/v1/groups/${id}/ledger?type=${type}&q=${encodeURIComponent(q)}`));
    } catch (err) { setE(err); }
  };
  useEffect(() => { load(); }, [id]);
  useEffect(() => { loadLedger(); }, [id, type]);

  const members = detail?.members || [];

  const invite = async (ev) => {
    ev.preventDefault();
    try {
      const r = await api.post(`/api/v1/groups/${id}/invites`, { emails: [email] });
      notifications.show({ title: 'Invite sent', message: `added: ${r.added} pending: ${r.pending}`, color: 'teal' });
      setEmail('');
      load();
    } catch (err) { setE(err); }
  };
  const searchContacts = async (ev) => {
    ev.preventDefault();
    try { setContacts(await api.get(`/api/v1/contacts?q=${encodeURIComponent(cq)}`)); }
    catch (err) { setE(err); }
  };
  const addMember = async (uid) => {
    try {
      await api.post(`/api/v1/groups/${id}/members`, { user_ids: [uid] });
      notifications.show({ title: 'Member added', color: 'teal' });
      load();
    } catch (err) { setE(err); }
  };
  const remove = (uid, name) => {
    modals.openConfirmModal({
      title: 'Remove member',
      centered: true,
      children: <Text size="sm">Remove {name}? Blocked while they hold a balance. History is kept.</Text>,
      labels: { confirm: 'Remove', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await api.del(`/api/v1/groups/${id}/members/${uid}`);
          load();
        } catch (err) { setE(err); }
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
    modals.openConfirmModal({
      title: 'Leave group',
      centered: true,
      children: <Text size="sm">Leave this group? Blocked while you hold a balance.</Text>,
      labels: { confirm: 'Leave', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try { await api.post(`/api/v1/groups/${id}/leave`, {}); nav('/'); }
        catch (err) { setE(err); }
      },
    });
  };

  if (!detail) {
    return (
      <Shell>
        <Text c="dimmed">Loading…</Text>
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
              onDone={() => { setShowExp(false); load(); loadLedger(); }}
            />
          </Card>
        )}

        <Card withBorder shadow="sm" padding="md" radius="md">
          <Group justify="space-between" mb="sm">
            <Title order={4}>Ledger</Title>
            {ledger && <Text size="sm" c="dimmed">{ledger.total} total</Text>}
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
            <Button size="xs" variant="default" onClick={loadLedger}>Go</Button>
          </Group>
          <Table striped highlightOnHover withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Item</Table.Th>
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
                      <Button size="xs" variant="subtle" color="red" onClick={() => remove(m.user_id, m.display_name)}>
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
                  <Button type="submit">Invite</Button>
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
                  <Button type="submit" variant="default">Search</Button>
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

      <Modal opened={payOpen} onClose={() => setPayOpen(false)} title="Record payment" centered>
        <PaymentForm
          groupId={id}
          members={members}
          preset={payPreset}
          onDone={(r) => {
            setPayOpen(false);
            setPayPreset(null);
            load();
            loadLedger();
            notifications.show({
              title: r.fully_settled ? 'Fully settled' : 'Payment recorded',
              color: 'teal',
            });
          }}
        />
      </Modal>

      <Modal opened={inviteOpen} onClose={() => setInviteOpen(false)} title="New invite link" centered>
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
