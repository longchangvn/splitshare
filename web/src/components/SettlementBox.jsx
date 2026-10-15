import { useEffect, useState } from 'react';
import {
  Accordion, Alert, Button, Group, List, Select, Skeleton, Spoiler, Stack, Table, Text,
} from '@mantine/core';
import { api, fmt } from '../api.js';
import { Err } from '../auth.jsx';
import { displayNameOf } from './Net.jsx';

// Collapsible settlement explanation (spec §5/Why-box). Collapsed by default.
export function SettlementBox({ groupId, currency, members, onPay }) {
  const [plan, setPlan] = useState(null);
  const [hist, setHist] = useState([]);
  const [viewV, setViewV] = useState(null);
  const [payments, setPayments] = useState([]);
  const [e, setE] = useState(null);

  const load = () => api.get(`/api/v1/groups/${groupId}/settlement`).then((p) => { setPlan(p); setViewV(null); }).catch(setE);
  useEffect(() => { load(); }, [groupId]);
  // Completed-transfer history: kept forever, shown even when fully settled.
  useEffect(() => {
    api.get(`/api/v1/groups/${groupId}/ledger?type=payment&limit=100`)
      .then((r) => setPayments(r.items || [])).catch(() => {});
  }, [groupId]);

  const loadHist = async () => {
    try { setHist(await api.get(`/api/v1/groups/${groupId}/settlement/history`)); }
    catch (err) { setE(err); }
  };
  const view = viewV ? hist.find((h) => h.version === viewV) : plan;
  if (!view && !e) return <Skeleton height={52} radius="md" />;

  const ex = view?.explanation || {};
  const transfers = view?.transfers || [];
  const historical = viewV !== null;
  const head = transfers.length === 0
    ? 'All settled — nets all $0.00'
    : `Optimized: ${ex.raw_debts ?? '?'} debts → ${transfers.length} transfers (saved ${ex.saved ?? '?'}) • v${view?.version} • Why?`;

  return (
    <Accordion
      variant="separated"
      radius="md"
      styles={{ item: { borderColor: transfers.length > 0 ? 'var(--mantine-color-teal-3)' : undefined } }}
    >
      <Accordion.Item value="plan">
        <Accordion.Control aria-expanded={undefined}>{head}</Accordion.Control>
        <Accordion.Panel>
          <Stack gap="sm">
            {historical && (
              <Alert color="yellow" variant="light">
                Historical plan v{viewV} — read-only, not actionable.
              </Alert>
            )}
            <Text fw={600} size="sm">Net balances before</Text>
            <Table striped highlightOnHover withTableBorder>
              <Table.Tbody>
                {Object.entries(ex.before_nets || {}).map(([id, v]) => (
                  <Table.Tr key={id}>
                    <Table.Td>{displayNameOf(members, id)}</Table.Td>
                    <Table.Td>{fmt(v, currency)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            <Text fw={600} size="sm">Steps</Text>
            <List size="sm" spacing="xs" type="ordered">
              {(ex.steps || []).map((s, i) => <List.Item key={i}>{s}</List.Item>)}
            </List>
            <Text fw={600} size="sm">Final transfers</Text>
            <Stack gap="xs">
              {transfers.map((t, i) => (
                <Group
                  key={i}
                  justify="space-between"
                  wrap="nowrap"
                  p="xs"
                  style={{ background: 'var(--mantine-color-gray-0)', borderRadius: 'var(--mantine-radius-md)' }}
                >
                  <Text size="sm">
                    <b>{displayNameOf(members, t.from_user_id)} → {displayNameOf(members, t.to_user_id)}</b>{' '}
                    {fmt(t.amount_cents, currency)}
                  </Text>
                  {!historical && (
                    <Button size="xs" variant="filled" color="teal" onClick={() => onPay(t)}>Pay</Button>
                  )}
                </Group>
              ))}
              {transfers.length === 0 && (
                <Text size="sm" c="dimmed">All settled — nets $0.00 🎉</Text>
              )}
            </Stack>
            <Text size="xs" c="dimmed">v{view.version} · {view.computed_at} · {view.inputs_hash}</Text>
            <Text fw={600} size="sm" mt="sm">Completed transfers ({payments.length})</Text>
            {payments.length === 0 ? (
              <Text size="sm" c="dimmed">No transfers recorded yet.</Text>
            ) : (
              <List size="sm" spacing="xs">
                {payments.map((p) => (
                  <List.Item key={p.id}>
                    {p.from_name || displayNameOf(members, p.from_user_id)} → {p.to_name || displayNameOf(members, p.to_user_id)}:{' '}
                    <b>{fmt(p.amount_cents, currency)}</b>{' '}
                    <Text span size="xs" c="dimmed">
                      {new Date(p.created_at).toLocaleString()}{p.reversed ? ' · reversed' : ''}{p.status === 'LOCKED' ? ' · settled' : ''}
                    </Text>
                  </List.Item>
                ))}
              </List>
            )}
            <Spoiler maxHeight={0} showLabel="View raw debts (unoptimized)" hideLabel="Hide">
              <Text size="sm" c="dimmed">
                Raw view: {ex.raw_debts} participant-share debts collapsed into {transfers.length} transfers.
              </Text>
            </Spoiler>
            <Group gap="xs">
              <Button size="xs" variant="default" onClick={loadHist}>History</Button>
              <Button size="xs" variant="default" onClick={load}>Refresh</Button>
              {hist.length > 0 && (
                <Select
                  size="xs"
                  placeholder="current"
                  clearable
                  value={viewV ? String(viewV) : null}
                  onChange={(v) => setViewV(v ? Number(v) : null)}
                  data={hist.map((h) => ({ value: String(h.version), label: `v${h.version} · ${h.computed_at}` }))}
                />
              )}
            </Group>
            <Err e={e} />
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}
