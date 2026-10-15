import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Anchor, Box, Button, Card, Group, List, Stack, Table, Text, Title } from '@mantine/core';
import { api, fmt } from '../api.js';
import { Err } from '../auth.jsx';
import { Shell } from '../components/Shell.jsx';
import { displayNameOf } from '../components/Net.jsx';
import { NameValueList } from '../components/Mobile.jsx';

// Printable trip summary: totals, per-person, settlement, categories.
export function Report() {
  const { id } = useParams();
  const [detail, setDetail] = useState(null);
  const [summary, setSummary] = useState(null);
  const [plan, setPlan] = useState(null);
  const [breakdown, setBreakdown] = useState([]);
  const [e, setE] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get(`/api/v1/groups/${id}`),
      api.get(`/api/v1/groups/${id}/summary`),
      api.get(`/api/v1/groups/${id}/settlement`).catch(() => null),
      api.get(`/api/v1/groups/${id}/breakdown`).catch(() => []),
    ]).then(([d, s, p, b]) => { setDetail(d); setSummary(s); setPlan(p); setBreakdown(b || []); })
      .catch(setE);
  }, [id]);

  if (!detail) return <Shell><Text c="dimmed">Loading…</Text><Err e={e} /></Shell>;
  const c = detail.currency;
  const members = detail.members || [];
  const totalPaid = (summary || []).reduce((a, m) => a + m.total_paid_cents, 0);

  return (
    <Shell>
      <Anchor component={Link} to={`/groups/${id}`} size="sm" className="no-print">← Back to group</Anchor>
      <Group justify="space-between" mt="xs" className="no-print">
        <Title order={2}>{detail.name} — report</Title>
        <Button onClick={() => window.print()}>Print / PDF</Button>
      </Group>
      <Title order={2} mt="xs" className="only-print">{detail.name} — trip report</Title>
      <Err e={e} />
      <Stack gap="md" mt="md">
        <Card withBorder padding="md" radius="md">
          <Title order={4} mb="sm">Totals</Title>
          <Text size="sm">Total paid: <b>{fmt(totalPaid, c)}</b> · {detail.mode} group · {c}</Text>
          {detail.budget && (
            <Text size="sm">Budget: {fmt(detail.budget.budget_cents, c)} · spent {fmt(detail.budget.spent_cents, c)} ({detail.budget.pct}%)</Text>
          )}
        </Card>
        <Card withBorder padding="md" radius="md">
          <Title order={4} mb="sm">Per person</Title>
          <Box hiddenFrom="sm">
            <Stack gap="xs">
              {(summary || []).map((m) => (
                <Card key={m.user_id} withBorder radius="md" padding="sm">
                  <Text size="sm" fw={600}>{m.display_name}</Text>
                  <Group gap="md" mt={2}>
                    <Text size="xs" c="dimmed">paid <Text span fw={600} c="dark">{fmt(m.total_paid_cents, c)}</Text></Text>
                    <Text size="xs" c="dimmed">share <Text span fw={600} c="dark">{fmt(m.total_share_cents, c)}</Text></Text>
                    <Text size="xs" c="dimmed">net <Text span fw={600} c="dark">{m.net_cents === 0 ? 'settled' : fmt(m.net_cents, c)}</Text></Text>
                  </Group>
                </Card>
              ))}
            </Stack>
          </Box>
          <Box visibleFrom="sm">
          <Table striped withTableBorder>
            <Table.Thead><Table.Tr><Table.Th>Member</Table.Th><Table.Th>Paid</Table.Th><Table.Th>Share</Table.Th><Table.Th>Net</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {(summary || []).map((m) => (
                <Table.Tr key={m.user_id}>
                  <Table.Td>{m.display_name}</Table.Td>
                  <Table.Td>{fmt(m.total_paid_cents, c)}</Table.Td>
                  <Table.Td>{fmt(m.total_share_cents, c)}</Table.Td>
                  <Table.Td>{m.net_cents === 0 ? 'settled' : fmt(m.net_cents, c)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          </Box>
        </Card>
        <Card withBorder padding="md" radius="md">
          <Title order={4} mb="sm">By category</Title>
          <NameValueList
            currency={c}
            rows={breakdown.map((b) => ({ key: b.category, label: `${b.category} (${b.expense_count})`, value: b.paid_cents }))}
            total={breakdown.reduce((a, b) => a + b.paid_cents, 0)}
          />
        </Card>
        <Card withBorder padding="md" radius="md">
          <Title order={4} mb="sm">Settlement</Title>
          {(plan?.transfers || []).length === 0
            ? <Text size="sm">All settled.</Text>
            : (
              <List size="sm">
                {(plan?.transfers || []).map((t, i) => (
                  <List.Item key={i}>
                    {displayNameOf(members, t.from_user_id)} → {displayNameOf(members, t.to_user_id)}: <b>{fmt(t.amount_cents, c)}</b>
                  </List.Item>
                ))}
              </List>
            )}
          <Text size="xs" c="dimmed" mt="sm">Generated {new Date().toLocaleString()} · settlement v{plan?.version}</Text>
        </Card>
      </Stack>
    </Shell>
  );
}
