import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Anchor, Card, Container, List, Stack, Table, Text, Title } from '@mantine/core';
import { apiBlob, fmt } from '../api.js';

// Public read-only trip page. No login, no emails, no handles.
export function SharePage() {
  const { token } = useParams();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    apiBlob(`/api/v1/shared/${token}`).then(async (r) => {
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || 'Invalid link');
      setD(j);
    }).catch((e) => setErr(e.message));
  }, [token]);

  return (
    <Container size="sm" py="lg">
      <Text fw={800} size="lg" c="teal.7" component={Link} to="/" style={{ textDecoration: 'none' }}>SplitShare</Text>
      {err && <Card withBorder padding="md" radius="md" mt="md"><Text c="red">{err}</Text></Card>}
      {!d && !err && <Text c="dimmed" mt="md">Loading…</Text>}
      {d && (
        <Stack gap="md" mt="md">
          <Card withBorder shadow="sm" padding="md" radius="md">
            <Title order={2}>{d.name}</Title>
            <Text size="sm" c="dimmed">{d.currency} · {d.mode} group · shared read-only view</Text>
          </Card>
          <Card withBorder shadow="sm" padding="md" radius="md">
            <Title order={4} mb="sm">Per person</Title>
            <Table striped withTableBorder>
              <Table.Thead><Table.Tr><Table.Th>Member</Table.Th><Table.Th>Paid</Table.Th><Table.Th>Share</Table.Th><Table.Th>Net</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>
                {d.members.map((m, i) => (
                  <Table.Tr key={i}>
                    <Table.Td>{m.display_name}</Table.Td>
                    <Table.Td>{fmt(m.paid_cents, d.currency)}</Table.Td>
                    <Table.Td>{fmt(m.share_cents, d.currency)}</Table.Td>
                    <Table.Td>{m.net_cents === 0 ? 'settled' : fmt(m.net_cents, d.currency)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Card>
          <Card withBorder shadow="sm" padding="md" radius="md">
            <Title order={4} mb="sm">Who pays whom</Title>
            {d.transfers.length === 0
              ? <Text size="sm">All settled. 🎉</Text>
              : (
                <List size="sm">
                  {d.transfers.map((t, i) => (
                    <List.Item key={i}>{t.from} → {t.to}: <b>{fmt(t.amount_cents, d.currency)}</b></List.Item>
                  ))}
                </List>
              )}
          </Card>
          <Anchor component={Link} to="/login" size="sm">Log in to SplitShare</Anchor>
        </Stack>
      )}
    </Container>
  );
}
