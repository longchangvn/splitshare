import { useEffect, useState } from 'react';
import {
  Alert, Button, Checkbox, Group, Paper, SegmentedControl, Select, Stack, Text,
  TextInput,
} from '@mantine/core';
import { api } from '../api.js';
import { Err } from '../auth.jsx';
import { displayNameOf } from './Net.jsx';

// Expense create/edit with live split preview + un-settle confirm (tasks 8.2/8.3).
export function ExpenseForm({ groupId, members, existing, onDone }) {
  const [title, setTitle] = useState(existing?.title || '');
  const [amount, setAmount] = useState(existing ? (existing.amount_cents / 100).toFixed(2) : '');
  const [payer, setPayer] = useState(existing?.payer_id || members[0]?.user_id || '');
  const [type, setType] = useState(existing?.split_type || 'EQUAL');
  const [sel, setSel] = useState(() =>
    existing ? existing.splits.map((s) => s.user_id) : members.map((m) => m.user_id));
  const [detail, setDetail] = useState(''); // "id:val,id:val" for EXACT(amount)/PERCENT/SHARES
  const [preview, setPreview] = useState(null);
  const [confirm, setConfirm] = useState(null); // [names] un-settle list
  const [pending, setPending] = useState(null); // PATCH body awaiting confirm
  const [e, setE] = useState(null);

  const parseDetail = () => detail.split(',').map((p) => p.trim()).filter(Boolean).map((p) => {
    const [id, v] = p.split(':');
    return { id: id.trim(), v: Number(v) };
  });

  const build = () => {
    const body = {
      title, amount: Number(amount), payer_id: payer, split_type: type, participant_ids: sel,
    };
    if (type === 'EXACT') body.exact = parseDetail().map((x) => ({ user_id: x.id, amount_cents: Math.round(x.v * 100) }));
    if (type === 'PERCENT') body.percent = parseDetail().map((x) => ({ user_id: x.id, percent: x.v }));
    if (type === 'SHARES') body.shares = parseDetail().map((x) => ({ user_id: x.id, shares: x.v }));
    return body;
  };

  useEffect(() => {
    if (!amount || sel.length === 0) { setPreview(null); return; }
    const t = setTimeout(async () => {
      try {
        const b = build();
        const url = existing
          ? `/api/v1/expenses/${existing.expense_id}/preview-edit`
          : `/api/v1/groups/${groupId}/expenses/preview-split`;
        setPreview(await api.post(url, b));
        setE(null);
      } catch (err) { setPreview(null); setE(err); }
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, type, detail, payer, sel.join(',')]);

  const submit = async (ev) => {
    ev.preventDefault();
    setE(null);
    try {
      if (!existing) {
        await api.post(`/api/v1/groups/${groupId}/expenses`, build());
        onDone();
      } else {
        const r = await api.patch(`/api/v1/expenses/${existing.expense_id}`,
          { expected_version: existing.version, ...build() });
        onDone(r);
      }
    } catch (err) {
      setE(err);
    }
  };

  // Pre-save un-settle check for edits: preview-edit already ran live; if it
  // flags members, ask for confirmation naming them.
  const submitEdit = async (ev) => {
    ev.preventDefault();
    const names = preview?.unsettled_user_ids || [];
    if (names.length > 0 && !pending) {
      const resolved = names.map((id) => {
        const share = preview.shares?.[id] != null ? ` → ${(preview.shares[id] / 100).toFixed(2)}` : '';
        return `${displayNameOf(members, id)} ($0.00${share})`;
      });
      setPending(true);
      setConfirm(resolved);
      return;
    }
    setConfirm(null);
    setPending(null);
    await submit(ev);
  };

  return (
    <form onSubmit={existing ? submitEdit : submit}>
      <Stack gap="sm">
        <Text fw={600}>{existing ? 'Edit expense' : 'New expense'}</Text>
        <TextInput label="Title" required value={title} onChange={(x) => setTitle(x.target.value)} />
        <TextInput label="Amount" required inputMode="decimal" value={amount} onChange={(x) => setAmount(x.target.value)} />
        <Select
          label="Payer"
          value={payer}
          onChange={setPayer}
          data={members.map((m) => ({ value: m.user_id, label: m.display_name }))}
        />
        <SegmentedControl
          fullWidth
          value={type}
          onChange={setType}
          data={['EQUAL', 'EXACT', 'PERCENT', 'SHARES']}
        />
        <Checkbox.Group label="Participants" value={sel} onChange={setSel}>
          <Stack gap={4} mt={4}>
            {members.map((m) => (
              <Checkbox key={m.user_id} value={m.user_id} label={m.display_name} />
            ))}
          </Stack>
        </Checkbox.Group>
        {type !== 'EQUAL' && (
          <TextInput
            label="Split detail"
            description={type === 'EXACT' ? 'user_id:dollars, …' : type === 'PERCENT' ? 'user_id:percent, …' : 'user_id:shares, …'}
            value={detail}
            onChange={(x) => setDetail(x.target.value)}
          />
        )}
        {preview && (
          <Paper withBorder p="sm" radius="md">
            <Text size="sm">
              Preview:{' '}
              {Object.entries(preview.shares || {}).map(([id, v]) => (
                `${displayNameOf(members, id)} ${(v / 100).toFixed(2)}`
              )).join(' · ')}
            </Text>
            {preview.unsettled_user_ids?.length > 0 && (
              <Text size="sm" fw={600} c="orange">
                Will un-settle {preview.unsettled_user_ids.length} member(s)
              </Text>
            )}
          </Paper>
        )}
        {confirm && (
          <Alert color="orange" variant="light" title="This will un-settle the following members">
            <Text size="sm" mb="xs">{confirm.join(', ')}. Continue?</Text>
            <Group gap="xs">
              <Button size="xs" type="submit">Yes, save</Button>
              <Button size="xs" variant="default" onClick={() => { setConfirm(null); setPending(null); }}>
                Cancel
              </Button>
            </Group>
          </Alert>
        )}
        {!confirm && <Button type="submit">{existing ? 'Save changes' : 'Add expense'}</Button>}
        <Err e={e} />
      </Stack>
    </form>
  );
}

export function PaymentForm({ groupId, members, preset, onDone }) {
  const options = [...members];
  for (const key of ['from_user_id', 'to_user_id']) {
    const id = preset?.[key];
    if (id && !options.some((m) => m.user_id === id)) {
      options.push({ user_id: id, display_name: `${id.slice(0, 8)} (former member)` });
    }
  }
  const [from, setFrom] = useState(preset?.from_user_id || '');
  const [to, setTo] = useState(preset?.to_user_id || '');
  const [amount, setAmount] = useState(preset?.amount_cents != null ? (preset.amount_cents / 100).toFixed(2) : '');
  const [method, setMethod] = useState('transfer');
  const [note, setNote] = useState('');
  const [e, setE] = useState(null);

  const go = async (ev) => {
    ev.preventDefault();
    try {
      const r = await api.post(`/api/v1/groups/${groupId}/payments`,
        { from_user_id: from, to_user_id: to, amount: Number(amount), method, note: note || null });
      onDone(r);
    } catch (err) { setE(err); }
  };

  const data = options.map((m) => ({ value: m.user_id, label: m.display_name }));
  return (
    <form onSubmit={go}>
      <Stack gap="sm">
        <Text fw={600}>Record payment</Text>
        <Select label="From" required searchable value={from} onChange={setFrom} data={data} />
        <Select label="To" required searchable value={to} onChange={setTo} data={data} />
        <TextInput label="Amount" required inputMode="decimal" value={amount} onChange={(x) => setAmount(x.target.value)} />
        <SegmentedControl
          fullWidth
          value={method}
          onChange={setMethod}
          data={['cash', 'transfer', 'other']}
        />
        <TextInput label="Note (optional)" value={note} onChange={(x) => setNote(x.target.value)} />
        <Button type="submit">Record payment</Button>
        <Err e={e} />
      </Stack>
    </form>
  );
}
