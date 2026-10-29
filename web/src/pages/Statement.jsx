import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Anchor, Box, Card, Select, Stack, Table, Text, Title, ScrollArea } from '@mantine/core';
import { api, fmt } from '../api.js';
import { Err } from '../auth.jsx';
import { Shell } from '../components/Shell.jsx';
import { useT } from '../prefs.jsx';

export function StatementMobileList({ entries = [], closingCents, currency = '' }) {
  return (
    <div className="statement-mobile-list">
      {entries.map((r, i) => {
        const at = new Date(r.entry.at);
        const kind = String(r.entry.kind || '');
        return (
          <div className="statement-mobile-entry" key={i}>
            <div className="statement-mobile-entry-copy">
              <Text className="statement-mobile-entry-title" size="sm" fw={700} truncate>{r.entry.title}</Text>
              <div className="statement-mobile-entry-meta">
                <span className={`statement-mobile-entry-kind is-${kind.replaceAll('_', '-')}`}>{kind.replaceAll('_', ' ')}</span>
                <span className="statement-mobile-entry-date">{at.toLocaleDateString()}</span>
                <span className="statement-mobile-entry-time">{at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
            <div className="statement-mobile-entry-values">
              <span className="statement-mobile-entry-amount">{fmt(r.entry.amount_cents, currency)}</span>
              <span className="statement-mobile-entry-running">→ {fmt(r.running_cents, currency)}</span>
            </div>
          </div>
        );
      })}
      {typeof closingCents === 'number' && (
        <div className="statement-mobile-closing">
          <Text size="sm" fw={700}>Closing net</Text>
          <Text size="sm" fw={800}>{fmt(closingCents, currency)}</Text>
        </div>
      )}
    </div>
  );
}

export function StatementPanel({ groupId, members = [], currency = '', embedded = false, reloadKey = 0 }) {
  const t = useT();
  const [uid, setUid] = useState(members[0]?.user_id || '');
  const [stmt, setStmt] = useState(null);
  const [e, setE] = useState(null);

  useEffect(() => {
    if ((!uid || !members.some((m) => m.user_id === uid)) && members[0]?.user_id) setUid(members[0].user_id);
  }, [members, uid]);

  useEffect(() => {
    if (!groupId || !uid) return;
    let cancel = false;
    api.get(`/api/v1/groups/${groupId}/statement/${uid}`)
      .then((d) => { if (!cancel) { setStmt(d); setE(null); } })
      .catch((err) => { if (!cancel) setE(err); });
    return () => { cancel = true; };
  }, [groupId, uid, reloadKey]);

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
        <StatementMobileList
          entries={stmt?.entries || []}
          closingCents={stmt?.closing_cents}
          currency={currency}
        />
      </Box>
      <Box visibleFrom="sm">
        <ScrollArea>
          <Table className="statement-table" miw={520}>
            <Table.Thead>
              <Table.Tr><Table.Th>Date</Table.Th><Table.Th>Event</Table.Th><Table.Th>Amount</Table.Th><Table.Th>Running</Table.Th></Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(stmt?.entries || []).map((r, i) => {
                const kind = String(r.entry.kind || '');
                return (
                  <Table.Tr key={i}>
                    <Table.Td className="statement-table-date">{new Date(r.entry.at).toLocaleDateString()}</Table.Td>
                    <Table.Td>
                      <div className="statement-table-event">
                        <span className={`statement-table-kind is-${kind.replaceAll('_', '-')}`}>{kind.replaceAll('_', ' ')}</span>
                        <span className="statement-table-title">{r.entry.title}</span>
                      </div>
                    </Table.Td>
                    <Table.Td className="statement-table-amount">{fmt(r.entry.amount_cents, currency)}</Table.Td>
                    <Table.Td className="statement-table-running">{fmt(r.running_cents, currency)}</Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
            <Table.Tfoot>
              <Table.Tr className="statement-table-closing">
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
  const t = useT();
  const { id } = useParams();
  const [detail, setDetail] = useState(null);
  const [e, setE] = useState(null);

  useEffect(() => {
    api.get(`/api/v1/groups/${id}`).then(setDetail).catch(setE);
  }, [id]);

  return (
    <Shell>
      <Anchor component={Link} to={`/groups/${id}`} size="sm">{t('common.backToGroup')}</Anchor>
      <Title order={2} mt="xs">{t('statement.title')}</Title>
      <Err e={e} />
      <Card withBorder shadow="sm" padding="md" radius="md" mt="md">
        {detail ? (
          <StatementPanel
            groupId={id}
            members={detail.members || []}
            currency={detail.currency || ''}
          />
        ) : (
          <Text size="sm" c="dimmed">{t('common.loading')}</Text>
        )}
      </Card>
    </Shell>
  );
}
