import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Anchor, Box, Card, Group, Select, Stack, Table, Text, Title, ScrollArea } from '@mantine/core';
import { api, fmt } from '../api.js';
import { Err } from '../auth.jsx';
import { Shell } from '../components/Shell.jsx';

export function StatementPanel({ groupId, members = [], currency = '', embedded = false }) {
  const [uid, setUid] = useState(members[0]?.user_id || '');
  const [stmt, setStmt] = useState(null);
  const [e, setE] = useState(null);

  useEffect(() => {
    if (!uid && members[0]?.user_id) setUid(members[0].user_id);
  }, [members, uid]);

  useEffect(() => {
    if (!groupId || !uid) return;
    let cancel = false;
    api.get(`/api/v1/groups/${groupId}/statement/${uid}`)
      .then((d) => { if (!cancel) { setStmt(d); setE(null); } })
      .catch((err) => { if (!cancel) setE(err); });
    return () => { cancel = true; };
  }, [groupId, uid]);

  return (
    <Stack gap="sm">
      {!embedded && <Text size="sm" fw={600}>Statement</Text>}
      <Err e={e} />
      <Select
        label="Member"
        value={uid}
        onChange={(v) => setUid(v || '')}
        data={members.map((m) => ({ value: m.user_id, label: m.display_name }))}
      />
      <Box hiddenFrom="sm">
        <Stack gap="xs">
          {(stmt?.entries || []).map((r, i) => (
            <Card key={i} withBorder radius="md" padding="sm">
              <Group justify="space-between" wrap="nowrap">
                <div style={{ minWidth: 0 }}>
                  <Text size="sm" fw={600} truncate>{r.entry.title}</Text>
                  <Text size="xs" c="dimmed">{r.entry.kind} · {new Date(r.entry.at).toLocaleDateString()}</Text>
                </div>
                <div style={{ textAlign: 'right', flex: 'none' }}>
                  <Text size="sm">{fmt(r.entry.amount_cents, currency)}</Text>
                  <Text size="xs" c="dimmed">→ {fmt(r.running_cents, currency)}</Text>
                </div>
              </Group>
            </Card>
          ))}
          {stmt && (
            <Card withBorder radius="md" padding="sm">
              <Group justify="space-between">
                <Text size="sm" fw={600}>Closing net</Text>
                <Text size="sm" fw={600}>{fmt(stmt.closing_cents, currency)}</Text>
              </Group>
            </Card>
          )}
        </Stack>
      </Box>
      <Box visibleFrom="sm">
        <ScrollArea>
          <Table striped highlightOnHover withTableBorder miw={520}>
            <Table.Thead>
              <Table.Tr><Table.Th>Date</Table.Th><Table.Th>Event</Table.Th><Table.Th>Amount</Table.Th><Table.Th>Running</Table.Th></Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(stmt?.entries || []).map((r, i) => (
                <Table.Tr key={i}>
                  <Table.Td>{new Date(r.entry.at).toLocaleDateString()}</Table.Td>
                  <Table.Td>{r.entry.kind}: {r.entry.title}</Table.Td>
                  <Table.Td>{fmt(r.entry.amount_cents, currency)}</Table.Td>
                  <Table.Td>{fmt(r.running_cents, currency)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
            <Table.Tfoot>
              <Table.Tr>
                <Table.Td colSpan={3}><Text size="sm" fw={600}>Closing net</Text></Table.Td>
                <Table.Td><Text size="sm" fw={600}>{stmt ? fmt(stmt.closing_cents, currency) : '—'}</Text></Table.Td>
              </Table.Tr>
            </Table.Tfoot>
          </Table>
        </ScrollArea>
      </Box>
      <Text size="xs" c="dimmed">paid = you paid the bill · share = your part · payment_out = you paid someone (reduces your debt).</Text>
    </Stack>
  );
}

export function Statement() {
  const { id } = useParams();
  const [detail, setDetail] = useState(null);
  const [e, setE] = useState(null);

  useEffect(() => {
    api.get(`/api/v1/groups/${id}`).then(setDetail).catch(setE);
  }, [id]);

  return (
    <Shell>
      <Anchor component={Link} to={`/groups/${id}`} size="sm">← Back to group</Anchor>
      <Title order={2} mt="xs">Statement</Title>
      <Err e={e} />
      <Card withBorder shadow="sm" padding="md" radius="md" mt="md">
        {detail ? (
          <StatementPanel
            groupId={id}
            members={detail.members || []}
            currency={detail.currency || ''}
          />
        ) : (
          <Text size="sm" c="dimmed">Loading…</Text>
        )}
      </Card>
    </Shell>
  );
}
