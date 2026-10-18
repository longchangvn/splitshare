import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Anchor, Card, Container, List, Stack, Table, Text, Title } from '@mantine/core';
import { fmt } from '../api.js';
import { useT } from '../prefs.jsx';

// Public read-only trip page. No login, no emails, no handles.
export function SharePage() {
  const t = useT();
  const { token } = useParams();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    fetch(`/api/v1/shared/${token}`).then(async (r) => {
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || t('errors.invalidLink'));
      setD(j);
    }).catch((e) => setErr(e.message));
  }, [token]);

  return (
    <Container size="sm" py="lg">
      <Text fw={800} size="lg" c="teal.7" component={Link} to="/" style={{ textDecoration: 'none' }}>SplitShare</Text>
      {err && <Card withBorder padding="md" radius="md" mt="md"><Text c="red">{err}</Text></Card>}
      {!d && !err && <Text c="dimmed" mt="md">{t('common.loading')}</Text>}
      {d && (
        <Stack gap="md" mt="md">
          <Card withBorder shadow="sm" padding="md" radius="md">
            <Title order={2}>{d.name}</Title>
            <Text size="sm" c="dimmed">{d.currency} · {d.mode} group · {t('share.readOnly')}</Text>
          </Card>
          <Card withBorder shadow="sm" padding="md" radius="md">
            <Title order={4} mb="sm">{t('report.perPerson')}</Title>
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
            <Title order={4} mb="sm">{t('share.whoPaysWhom')}</Title>
            {d.transfers.length === 0
              ? <Text size="sm">{t('report.allSettled')} 🎉</Text>
              : (
                <List size="sm">
                  {d.transfers.map((t, i) => (
                    <List.Item key={i}>{t.from} → {t.to}: <b>{fmt(t.amount_cents, d.currency)}</b></List.Item>
                  ))}
                </List>
              )}
          </Card>
          <Anchor component={Link} to="/login" size="sm">{t('share.logIn')}</Anchor>
        </Stack>
      )}
    </Container>
  );
}
