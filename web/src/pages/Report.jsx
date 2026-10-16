import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Anchor, Box, Button, Card, Group, List, Stack, Table, Text, Title } from '@mantine/core';
import { api, fmt } from '../api.js';
import { Err } from '../auth.jsx';
import { Shell } from '../components/Shell.jsx';
import { displayNameOf } from '../components/Net.jsx';
import { NameValueList } from '../components/Mobile.jsx';
import { MoneyDonut, PaidShareBars } from '../components/MoneyCharts.jsx';

// Printable trip summary: totals, per-person, settlement, categories.
export function ReportPanel({
  groupId,
  detail: detailProp = null,
  summary: summaryProp = null,
  embedded = false,
}) {
  const [detail, setDetail] = useState(detailProp);
  const [summary, setSummary] = useState(summaryProp);
  const [plan, setPlan] = useState(null);
  const [breakdown, setBreakdown] = useState([]);
  const [e, setE] = useState(null);

  useEffect(() => { setDetail(detailProp); }, [detailProp]);
  useEffect(() => { setSummary(summaryProp); }, [summaryProp]);

  useEffect(() => {
    if (!groupId) return;
    let cancel = false;
    const needDetail = !detailProp;
    const needSummary = !summaryProp;
    Promise.all([
      needDetail ? api.get(`/api/v1/groups/${groupId}`) : Promise.resolve(detailProp),
      needSummary ? api.get(`/api/v1/groups/${groupId}/summary`) : Promise.resolve(summaryProp),
      api.get(`/api/v1/groups/${groupId}/settlement`).catch(() => null),
      api.get(`/api/v1/groups/${groupId}/breakdown`).catch(() => []),
    ]).then(([d, s, p, b]) => {
      if (cancel) return;
      setDetail(d);
      setSummary(s);
      setPlan(p);
      setBreakdown(b || []);
      setE(null);
    }).catch((err) => { if (!cancel) setE(err); });
    return () => { cancel = true; };
  }, [groupId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!detail) return <Text size="sm" c="dimmed">Loading…<Err e={e} /></Text>;

  const c = detail.currency;
  const members = detail.members || [];
  const rows = summary || [];
  const totalPaid = rows.reduce((a, m) => a + m.total_paid_cents, 0);
  const totalShare = rows.reduce((a, m) => a + m.total_share_cents, 0);
  const paidRows = [...rows].sort((a, b) => b.total_paid_cents - a.total_paid_cents)
    .map((m) => ({ key: m.user_id, label: m.display_name, value: m.total_paid_cents, total_paid_cents: m.total_paid_cents }));
  const shareRows = [...rows].sort((a, b) => b.total_share_cents - a.total_share_cents)
    .map((m) => ({ key: m.user_id, label: m.display_name, value: m.total_share_cents, total_share_cents: m.total_share_cents }));

  return (
    <Stack gap="md">
      {!embedded && (
        <Group justify="space-between" className="no-print">
          <Text size="sm" fw={600}>{detail.name} — report</Text>
          <Button size="xs" variant="light" onClick={() => window.print()}>Print / PDF</Button>
        </Group>
      )}
      {embedded && (
        <Group justify="flex-end" className="no-print">
          <Button size="xs" variant="light" onClick={() => window.print()}>Print / PDF</Button>
        </Group>
      )}
      <Err e={e} />
      <Card withBorder padding="md" radius="md">
        <Text size="sm" fw={600} mb="sm">Totals</Text>
        <Text size="sm">Total paid: <b>{fmt(totalPaid, c)}</b> · Total share: <b>{fmt(totalShare, c)}</b> · {detail.mode} group · {c}</Text>
        {detail.budget && (
          <Text size="sm">Budget: {fmt(detail.budget.budget_cents, c)} · spent {fmt(detail.budget.spent_cents, c)} ({detail.budget.pct}%)</Text>
        )}
      </Card>

      <Card withBorder padding="md" radius="md">
        <Text size="sm" fw={600} mb="sm">Paid vs share</Text>
        <PaidShareBars summary={rows} currency={c} />
      </Card>

      <div className="report-split-charts">
        <Card withBorder padding="md" radius="md">
          <Text size="sm" fw={600} mb="sm">Total paid</Text>
          <MoneyDonut rows={paidRows} valueKey="total_paid_cents" currency={c} emptyLabel="No payments yet" />
          <Box mt="md">
            <NameValueList currency={c} rows={paidRows} total={totalPaid} />
          </Box>
        </Card>
        <Card withBorder padding="md" radius="md">
          <Text size="sm" fw={600} mb="sm">Total share</Text>
          <MoneyDonut rows={shareRows} valueKey="total_share_cents" currency={c} emptyLabel="No shares yet" />
          <Box mt="md">
            <NameValueList currency={c} rows={shareRows} total={totalShare} />
          </Box>
        </Card>
      </div>

      <Card withBorder padding="md" radius="md">
        <Text size="sm" fw={600} mb="sm">Per person</Text>
        <Box hiddenFrom="sm">
          <Stack gap="xs">
            {rows.map((m) => (
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
              {rows.map((m) => (
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
        <Text size="sm" fw={600} mb="sm">By category</Text>
        <NameValueList
          currency={c}
          rows={breakdown.map((b) => ({ key: b.category, label: `${b.category} (${b.expense_count})`, value: b.paid_cents }))}
          total={breakdown.reduce((a, b) => a + b.paid_cents, 0)}
        />
      </Card>
      <Card withBorder padding="md" radius="md">
        <Text size="sm" fw={600} mb="sm">Settlement</Text>
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
  );
}

export function Report() {
  const { id } = useParams();
  return (
    <Shell>
      <Anchor component={Link} to={`/groups/${id}`} size="sm" className="no-print">← Back to group</Anchor>
      <Title order={2} mt="xs" className="only-print">Trip report</Title>
      <Box mt="md">
        <ReportPanel groupId={id} />
      </Box>
    </Shell>
  );
}
