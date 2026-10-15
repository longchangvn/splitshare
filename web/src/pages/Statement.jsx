import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Anchor, Box, Card, Group, Select, Stack, Table, Text, Title, ScrollArea } from '@mantine/core';
import { api, fmt } from '../api.js';
import { Err } from '../auth.jsx';
import { Shell } from '../components/Shell.jsx';

export function Statement() {
  const { id } = useParams();
  const [detail, setDetail] = useState(null);
  const [uid, setUid] = useState('');
  const [stmt, setStmt] = useState(null);
  const [e, setE] = useState(null);

  useEffect(() => {
    api.get(`/api/v1/groups/${id}`).then((d) => {
      setDetail(d);
      if (!uid && d.members?.length > 0) setUid(d.members[0].user_id);
    }).catch(setE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!uid) return;
    api.get(`/api/v1/groups/${id}/statement/${uid}`).then(setStmt).catch(setE);
  }, [id, uid]);

  return (
    <Shell>
      <Anchor component={Link} to={`/groups/${id}`} size="sm">← Back to group</Anchor>
      <Title order={2} mt="xs">Statement</Title>
      <Err e={e} />
      <Card withBorder shadow="sm" padding="md" radius="md" mt="md">
        <Select
          label="Member"
          value={uid}
          onChange={(v) => setUid(v || '')}
          data={(detail?.members || []).map((m) => ({ value: m.user_id, label: m.display_name }))}
          mb="sm"
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
                    <Text size="sm">{fmt(r.entry.amount_cents, detail?.currency || '')}</Text>
                    <Text size="xs" c="dimmed">→ {fmt(r.running_cents, detail?.currency || '')}</Text>
                  </div>
                </Group>
              </Card>
            ))}
            {stmt && (
              <Card withBorder radius="md" padding="sm">
                <Group justify="space-between">
                  <Text size="sm" fw={600}>Closing net</Text>
                  <Text size="sm" fw={600}>{fmt(stmt.closing_cents, detail?.currency || '')}</Text>
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
                  <Table.Td>{fmt(r.entry.amount_cents, detail?.currency || '')}</Table.Td>
                  <Table.Td>{fmt(r.running_cents, detail?.currency || '')}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
            <Table.Tfoot>
              <Table.Tr>
                <Table.Td colSpan={3}><Text size="sm" fw={600}>Closing net</Text></Table.Td>
                <Table.Td><Text size="sm" fw={600}>{stmt ? fmt(stmt.closing_cents, detail?.currency || '') : '—'}</Text></Table.Td>
              </Table.Tr>
            </Table.Tfoot>
          </Table>
        </ScrollArea>
        </Box>
        <Stack gap={2} mt="sm">
          <Text size="xs" c="dimmed">paid = you paid the bill · share = your part · payment_out = you paid someone (reduces your debt).</Text>
        </Stack>
      </Card>
    </Shell>
  );
}
