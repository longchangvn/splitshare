import { useEffect, useState } from 'react';
import {
  Accordion, Alert, Box, Button, Checkbox, Group, Paper, ScrollArea, SegmentedControl, Select, Stack, Text,
  TextInput,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { api, fmt } from '../api.js';
import { Err } from '../auth.jsx';
import { displayNameOf } from './Net.jsx';

const splitVal = (s, type) => {
  if (!s) return '';
  if (type === 'EXACT' && s.exact_cents != null) return (s.exact_cents / 100).toString();
  if (type === 'PERCENT' && s.percent != null) return s.percent.toString();
  if (type === 'SHARES' && s.shares != null) return s.shares.toString();
  return '';
};

// Equal-percent distribution that sums to exactly 100.00 (mirrors server largest-remainder).
const equalPercent = (n) => {
  const base = Math.floor(10000 / n);
  const out = Array(n).fill(base);
  for (let i = 0; i < 10000 - base * n; i++) out[i] += 1;
  return out.map((c) => (c / 100).toString());
};

// Expense create/edit with live split preview + un-settle confirm (tasks 8.2/8.3).
// copyFrom: detail.expense payload to prefill a copy (task 4.1); images carried on save (4.2).
export function ExpenseForm({ groupId, members, existing, copyFrom, onDone, currency = '' }) {
  const source = existing ?? copyFrom ?? null;
  const isCopy = !!copyFrom && !existing;
  const activeIds = new Set(members.map((m) => m.user_id));

  const initSel = () => {
    if (existing) return existing.splits.map((s) => s.user_id);
    if (copyFrom) {
      const kept = copyFrom.splits.map((s) => s.user_id).filter((id) => activeIds.has(id));
      return kept.length > 0 ? kept : members.map((m) => m.user_id);
    }
    return members.map((m) => m.user_id);
  };
  const initValues = (type, sel) => {
    const out = {};
    if (!source || !source.splits) return out;
    for (const s of source.splits) {
      if (!sel.includes(s.user_id)) continue;
      const v = splitVal(s, type);
      if (v !== '') out[s.user_id] = v;
    }
    return out;
  };

  const [title, setTitle] = useState(
    existing?.title ?? (copyFrom ? `Copy of ${copyFrom.title}` : ''));
  const [amount, setAmount] = useState(
    source ? (source.amount_cents / 100).toFixed(2) : '');
  const [payer, setPayer] = useState(() => {
    const p = source?.payer_id;
    if (p && activeIds.has(p)) return p;
    return members[0]?.user_id || '';
  });
  const [type, setType] = useState(source?.split_type || 'EQUAL');
  const [sel, setSel] = useState(initSel);
  const [values, setValues] = useState(() => initValues(source?.split_type || 'EQUAL', initSel()));
  const [stashed, setStashed] = useState({}); // values of unchecked participants
  const [preview, setPreview] = useState(null);
  const [confirm, setConfirm] = useState(null); // [names] un-settle list
  const [pending, setPending] = useState(null); // PATCH body awaiting confirm
  const [saving, setSaving] = useState(false);
  const [imgErrs, setImgErrs] = useState([]);
  const [e, setE] = useState(null);
  // Trip-pack richness.
  const CATS = ['food', 'transport', 'stay', 'activity', 'shopping', 'health', 'bills', 'other'];
  const todayStr = () => new Date().toISOString().slice(0, 10);
  const [category, setCategory] = useState(source?.category || 'other');
  const [spentAt, setSpentAt] = useState(() =>
    source?.spent_at ? String(source.spent_at).slice(0, 10) : todayStr());
  const [tax, setTax] = useState(source?.tax_cents ? (source.tax_cents / 100).toFixed(2) : '');
  const [tip, setTip] = useState(source?.tip_cents ? (source.tip_cents / 100).toFixed(2) : '');
  const [fee, setFee] = useState(source?.fee_cents ? (source.fee_cents / 100).toFixed(2) : '');
  const [origCur, setOrigCur] = useState(source?.orig_currency || '');
  const [origAmt, setOrigAmt] = useState(source?.orig_amount_cents ? (source.orig_amount_cents / 100).toFixed(2) : '');
  const [fxRate, setFxRate] = useState(source?.fx_rate != null ? String(source.fx_rate) : '');
  const [guests, setGuests] = useState(() => (source?.guests || []).map((g) => ({
    label: g.label, amount: (g.share_cents / 100).toFixed(2), covered_by: g.covered_by,
  })));
  const [onlyPresent, setOnlyPresent] = useState(false);

  const dropped = copyFrom
    ? copyFrom.splits.map((s) => s.user_id).filter((id) => !activeIds.has(id))
    : [];
  const copyImages = isCopy ? (copyFrom.images || []) : [];

  const changeType = (t) => {
    setType(t);
    if (t === 'EQUAL') return;
    // Prefill empty boxes with equal defaults (keeps typed values).
    setValues((prev) => {
      const checked = sel.filter((id) => !(id in prev) || prev[id] === '');
      if (checked.length === 0) return prev;
      const next = { ...prev };
      if (t === 'PERCENT') {
        const all = sel.filter((id) => !(id in next) || next[id] === '');
        const dist = equalPercent(sel.length);
        sel.forEach((id, i) => { if (all.includes(id)) next[id] = dist[i]; });
      } else if (t === 'SHARES') {
        checked.forEach((id) => { next[id] = '1'; });
      }
      return next;
    });
  };

  const toggle = (id) => {
    if (sel.includes(id)) {
      setSel(sel.filter((x) => x !== id));
      setStashed({ ...stashed, ...(id in values ? { [id]: values[id] } : {}) });
      setValues((prev) => { const n = { ...prev }; delete n[id]; return n; });
    } else {
      setSel([...sel, id]);
      if (id in stashed) setValues((prev) => ({ ...prev, [id]: stashed[id] }));
    }
  };
  const setVal = (id, v) => setValues((prev) => ({ ...prev, [id]: v }));

  const build = () => {
    const body = {
      title, amount: Number(amount), payer_id: payer, split_type: type, participant_ids: sel,
      category, spent_at: spentAt ? new Date(`${spentAt}T12:00:00Z`).toISOString() : null,
      only_present: onlyPresent,
    };
    if (tax !== '') body.tax = Number(tax);
    if (tip !== '') body.tip = Number(tip);
    if (fee !== '') body.fee = Number(fee);
    if (origCur.trim() !== '') {
      body.orig_currency = origCur.trim().toUpperCase();
      body.orig_amount = Number(origAmt);
      body.fx_rate = Number(fxRate);
    }
    if (guests.length > 0) {
      body.guests = guests.map((g) => ({
        label: g.label, amount_cents: Math.round(Number(g.amount || 0) * 100), covered_by: g.covered_by,
      }));
    }
    if (type === 'EXACT') {
      body.exact = sel.map((id) => ({ user_id: id, amount_cents: Math.round(Number(values[id] || 0) * 100) }));
    }
    if (type === 'PERCENT') {
      body.percent = sel.map((id) => ({ user_id: id, percent: Number(values[id] || 0) }));
    }
    if (type === 'SHARES') {
      body.shares = sel.map((id) => ({ user_id: id, shares: Math.round(Number(values[id] || 0)) }));
    }
    return body;
  };

  // Local running totals (server 422 stays authoritative).
  const totals = (() => {
    if (type === 'EQUAL' || sel.length === 0) return null;
    const nums = sel.map((id) => Number(values[id] || 0));
    if (nums.some((n) => Number.isNaN(n))) return null;
    if (type === 'EXACT') {
      const sum = nums.reduce((a, b) => a + b, 0);
      return { text: `sum = $${sum.toFixed(2)} of $${Number(amount || 0).toFixed(2)}`, ok: Math.abs(sum - Number(amount || 0)) < 0.005 };
    }
    if (type === 'PERCENT') {
      const sum = nums.reduce((a, b) => a + b, 0);
      return { text: `${sum}% of 100%`, ok: Math.abs(sum - 100) < 1e-9 };
    }
    return { text: `${nums.reduce((a, b) => a + b, 0)} shares total`, ok: true };
  })();

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
  }, [amount, type, payer, category, spentAt, tax, tip, fee, origCur, origAmt, fxRate,
    JSON.stringify(guests), onlyPresent, sel.join(','), Object.values(values).join('|')]);

  // Task 4.2: carry source receipts onto the copy by download + re-upload.
  const carryImages = async (newExpenseId) => {
    const failures = [];
    for (const img of copyImages) {
      try {
        const r = await fetch(`/api/v1/images/${img.image_id}`,
          { headers: { Authorization: `Bearer ${localStorage.getItem('ss_at')}` } });
        if (!r.ok) throw new Error(`download ${r.status}`);
        const blob = await r.blob();
        const form = new FormData();
        form.append('file', new File([blob], 'receipt', { type: img.mime || blob.type }));
        await api.postForm(`/api/v1/expenses/${newExpenseId}/images`, form);
      } catch (err) {
        failures.push(`${img.image_id.slice(0, 8)}: ${err.message}`);
      }
    }
    return failures;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    if (saving) return; // double-submit guard
    setE(null);
    setImgErrs([]);
    setSaving(true);
    try {
      if (!existing) {
        const r = await api.post(`/api/v1/groups/${groupId}/expenses`, build());
        const newId = r.expense?.expense_id;
        if (isCopy && newId && copyImages.length > 0) {
          const failures = await carryImages(newId);
          if (failures.length > 0) {
            setImgErrs(failures);
            notifications.show({ title: 'Expense copied; some receipts failed', message: failures.join('; '), color: 'orange' });
          } else {
            notifications.show({ title: 'Expense copied with receipts', color: 'teal' });
          }
        }
        onDone(r);
      } else {
        const r = await api.patch(`/api/v1/expenses/${existing.expense_id}`,
          { expected_version: existing.version, ...build() });
        onDone(r);
      }
    } catch (err) {
      setE(err);
      setOpenSections(['basics', 'bill', 'split']); // surface the failing section on mobile
    } finally {
      setSaving(false);
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

  const boxLabel = type === 'EXACT' ? 'Exact $' : type === 'PERCENT' ? 'Percent %' : 'Shares';
  const isMobile = useMediaQuery('(max-width: 36em)');
  const [openSections, setOpenSections] = useState(['basics']);

  // Receipt strip (mockup screen 4): carried/thumbnail count + where to attach.
  // Uploads stay on the expense page (single-phase JSON create); this is display only.
  const receiptCount = isCopy ? copyImages.length : (source?.images?.length || 0);
  const receiptStrip = (
    <Paper withBorder p="sm" radius="md">
      <Group gap="xs" wrap="nowrap">
        {receiptCount > 0 ? (
          Array.from({ length: Math.min(receiptCount, 5) }).map((_, i) => (
            <Box key={i} w={52} h={52} style={{ background: 'var(--mantine-color-orange-1)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flex: 'none' }} aria-hidden>🧾</Box>
          ))
        ) : (
          <Box w={52} h={52} style={{ border: '2px dashed var(--mantine-color-gray-3)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: 'var(--mantine-color-dimmed)', flex: 'none' }} aria-hidden>＋</Box>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text size="sm" fw={600}>{receiptCount}/5 receipts</Text>
          <Text size="xs" c="dimmed">
            {isCopy
              ? 'Carried over on save.'
              : existing
                ? 'Manage receipts on the expense page.'
                : 'Attach on the expense page after save · jpg/png/webp/heic ≤10MB, GPS stripped'}
          </Text>
        </div>
      </Group>
    </Paper>
  );

  // EQUAL explainer (mockup screen 4): floor + remainder 1¢, who gets +1¢.
  const equalNote = (() => {
    if (type !== 'EQUAL' || !preview?.shares) return null;
    const entries = Object.entries(preview.shares);
    if (entries.length === 0) return null;
    const vals = entries.map(([, v]) => v);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const base = `EQUAL: ${fmt(lo, currency)} × ${entries.length}`;
    if (hi === lo) return `${base} · sum == total ✓`;
    const lucky = entries.filter(([, v]) => v === hi).map(([id]) => displayNameOf(members, id)).join(', ');
    return `${base} — floor + remainder 1¢ → ${lucky} gets +1¢ · sum == total ✓`;
  })();

  const basics = (
    <Stack gap="sm">
      {receiptStrip}
      <TextInput label="Title" required value={title} onChange={(x) => setTitle(x.target.value)} />
      <TextInput label="Amount" required inputMode="decimal" value={amount} onChange={(x) => setAmount(x.target.value)} />
      <Group gap="xs" grow>
        <Select label="Category" value={category} onChange={setCategory} data={CATS} />
        <TextInput label="Spent on" type="date" value={spentAt} onChange={(x) => setSpentAt(x.target.value)} />
      </Group>
      <Select
        label="Payer"
        value={payer}
        onChange={setPayer}
        data={members.map((m) => ({ value: m.user_id, label: m.display_name }))}
      />
    </Stack>
  );

  const bill = (
    <Stack gap="sm">
      <Group gap="xs" grow>
        <TextInput label="Tax (opt)" inputMode="decimal" placeholder="0.00" value={tax} onChange={(x) => setTax(x.target.value)} />
        <TextInput label="Tip (opt)" inputMode="decimal" placeholder="0.00" value={tip} onChange={(x) => setTip(x.target.value)} />
        <TextInput label="Fee (opt)" inputMode="decimal" placeholder="0.00" value={fee} onChange={(x) => setFee(x.target.value)} />
      </Group>
      <Paper withBorder p="sm" radius="md">
        <Text size="sm" fw={500} mb={4}>Foreign currency (optional)</Text>
        <Group gap="xs" grow>
          <TextInput placeholder="JPY" value={origCur} onChange={(x) => setOrigCur(x.target.value)} />
          <TextInput placeholder="Amount" inputMode="decimal" value={origAmt} onChange={(x) => setOrigAmt(x.target.value)} />
          <TextInput placeholder="Rate" inputMode="decimal" value={fxRate} onChange={(x) => setFxRate(x.target.value)} />
        </Group>
        {origCur.trim() !== '' && origAmt !== '' && fxRate !== '' && !Number.isNaN(Number(origAmt) * Number(fxRate)) && (
          <Text size="xs" c="dimmed" mt={4}>≈ {(Number(origAmt) * Number(fxRate)).toFixed(2)} in group currency</Text>
        )}
      </Paper>
      <Paper withBorder p="sm" radius="md">
        <Group justify="space-between" mb={4}>
          <Text size="sm" fw={500}>Guest shares (optional)</Text>
          <Button size="xs" variant="light" onClick={() => setGuests([...guests, { label: '', amount: '', covered_by: sel[0] || payer }])}>+ Guest</Button>
        </Group>
        {guests.map((g, i) => (
          <Group key={i} gap="xs" mb={4}>
            <TextInput placeholder="Label (Kid)" value={g.label} style={{ flex: 2 }}
              onChange={(x) => setGuests(guests.map((gg, j) => (j === i ? { ...gg, label: x.target.value } : gg)))} />
            <TextInput placeholder="$" inputMode="decimal" value={g.amount} style={{ flex: 1 }}
              onChange={(x) => setGuests(guests.map((gg, j) => (j === i ? { ...gg, amount: x.target.value } : gg)))} />
            <Select value={g.covered_by} style={{ flex: 2 }}
              onChange={(v) => setGuests(guests.map((gg, j) => (j === i ? { ...gg, covered_by: v } : gg)))}
              data={members.map((m) => ({ value: m.user_id, label: m.display_name }))} />
            <Button size="xs" variant="subtle" color="red" onClick={() => setGuests(guests.filter((gg, j) => j !== i))}>X</Button>
          </Group>
        ))}
        {guests.length === 0 && <Text size="xs" c="dimmed">Extra mouths covered by a member (added on top of their share).</Text>}
      </Paper>
      <Checkbox
        checked={onlyPresent}
        onChange={(x) => setOnlyPresent(x.currentTarget.checked)}
        label="Only members present (joined before spent date)"
      />
    </Stack>
  );

  const split = (
    <Stack gap="sm">
      <ScrollArea type="scroll">
        <SegmentedControl
          value={type}
          onChange={changeType}
          data={['EQUAL', 'EXACT', 'PERCENT', 'SHARES']}
          styles={{ root: { minWidth: 400 } }}
        />
      </ScrollArea>
      {equalNote && (
        <Paper p="sm" radius="md" style={{ background: 'var(--mantine-color-teal-0)', border: '1px dashed var(--mantine-color-teal-3)' }}>
          <Text size="xs" c="teal.9">{equalNote}</Text>
        </Paper>
      )}
      <Text size="sm" fw={500}>Participants</Text>
      <Stack gap={4}>
        {members.map((m) => (
          <div key={m.user_id} className="split-row">
            <Checkbox
              checked={sel.includes(m.user_id)}
              onChange={() => toggle(m.user_id)}
              label={m.display_name}
            />
            {type !== 'EQUAL' && sel.includes(m.user_id) && (
              <TextInput
                className="split-value"
                aria-label={`${boxLabel} for ${m.display_name}`}
                placeholder={boxLabel}
                inputMode="decimal"
                value={values[m.user_id] ?? ''}
                onChange={(x) => setVal(m.user_id, x.target.value)}
              />
            )}
          </div>
        ))}
      </Stack>
      {type !== 'EQUAL' && totals && (
        <Text size="sm" c={totals.ok ? 'teal' : 'orange'}>{totals.text}</Text>
      )}
      {preview && (
        <Paper p="sm" radius="md" style={{ background: 'var(--mantine-color-teal-0)', border: '1px solid var(--mantine-color-teal-2)' }}>
          <Text size="sm" fw={600} c="teal.9">Live preview · preview-split</Text>
          <Text size="sm" mt={4}>
            {Object.entries(preview.shares || {}).map(([id, v]) => (
              `${displayNameOf(members, id)} ${fmt(v, currency)}`
            )).join(' · ')}
          </Text>
          {preview.unsettled_user_ids?.length > 0 && (
            <Text size="sm" fw={600} c="orange" mt={4}>
              Will un-settle {preview.unsettled_user_ids.length} member(s)
            </Text>
          )}
        </Paper>
      )}
    </Stack>
  );

  const saveBtn = !confirm && (
    <Button type="submit" loading={saving} fullWidth={isMobile}>
      {existing ? 'Save changes' : isCopy ? 'Save copy' : 'Add expense'}
    </Button>
  );

  return (
    <form onSubmit={existing ? submitEdit : submit}>
      <Stack gap="sm">
        <Text fw={600}>{existing ? 'Edit expense' : isCopy ? 'Copy expense' : 'New expense'}</Text>
        {isCopy && dropped.length > 0 && (
          <Alert color="yellow" variant="light" title="Former members excluded from the copy">
            <Text size="sm">{dropped.map((id) => id.slice(0, 8)).join(', ')}</Text>
          </Alert>
        )}
        {isCopy && copyImages.length > 0 && (
          <Text size="sm" c="dimmed">{copyImages.length} receipt(s) will be carried over on save.</Text>
        )}
        <Box visibleFrom="sm">
          <Stack gap="sm">
            {basics}
            {bill}
            {split}
          </Stack>
        </Box>
        <Box hiddenFrom="sm">
          <Accordion multiple value={openSections} onChange={setOpenSections} variant="separated" radius="md">
            <Accordion.Item value="basics">
              <Accordion.Control>Basics</Accordion.Control>
              <Accordion.Panel>{basics}</Accordion.Panel>
            </Accordion.Item>
            <Accordion.Item value="bill">
              <Accordion.Control>Bill details</Accordion.Control>
              <Accordion.Panel>{bill}</Accordion.Panel>
            </Accordion.Item>
            <Accordion.Item value="split">
              <Accordion.Control>Split</Accordion.Control>
              <Accordion.Panel>{split}</Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        </Box>
        {confirm && (
          <Alert color="orange" variant="light" title="This will un-settle the following members">
            <Text size="sm" mb="xs">{confirm.join(', ')}. Continue?</Text>
            <Group gap="xs">
              <Button size="xs" type="submit" loading={saving}>Yes, save</Button>
              <Button size="xs" variant="default" onClick={() => { setConfirm(null); setPending(null); }}>
                Cancel
              </Button>
            </Group>
          </Alert>
        )}
        {!confirm && (
          <>
            <Box visibleFrom="sm">{saveBtn}</Box>
            <Box hiddenFrom="sm" className="sticky-bar">{saveBtn}</Box>
          </>
        )}
        {imgErrs.length > 0 && (
          <Alert color="orange" variant="light" title="Receipt carry-over failed">
            <Text size="sm">{imgErrs.join('; ')}</Text>
          </Alert>
        )}
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
  const [proofRef, setProofRef] = useState('');
  const [handles, setHandles] = useState([]);
  const [e, setE] = useState(null);
  const [paying, setPaying] = useState(false);

  // Settle sheet: show the receiver's payment handles + exact amount.
  useEffect(() => {
    if (!to) { setHandles([]); return; }
    api.get(`/api/v1/users/${to}/handles`).then(setHandles).catch(() => setHandles([]));
  }, [to]);

  const go = async (ev) => {
    ev.preventDefault();
    if (paying) return;
    setPaying(true);
    try {
      const r = await api.post(`/api/v1/groups/${groupId}/payments`,
        { from_user_id: from, to_user_id: to, amount: Number(amount), method, note: note || null, proof_ref: proofRef || null });
      onDone(r);
    } catch (err) { setE(err); } finally { setPaying(false); }
  };

  const data = options.map((m) => ({ value: m.user_id, label: m.display_name }));
  const toName = options.find((m) => m.user_id === to)?.display_name;
  return (
    <form onSubmit={go}>
      <Stack gap="sm">
        <Text fw={600}>Record payment</Text>
        <Select label="From" required searchable value={from} onChange={setFrom} data={data} />
        <Select label="To" required searchable value={to} onChange={setTo} data={data} />
        <TextInput label="Amount" required inputMode="decimal" value={amount} onChange={(x) => setAmount(x.target.value)} />
        {to && (
          <Paper withBorder p="sm" radius="md">
            <Text size="sm" fw={600} mb={4}>Pay {toName} {amount && `· ${amount}`}</Text>
            {handles.length === 0
              ? <Text size="xs" c="dimmed">No payment accounts on file — ask {toName} to add one in Profile.</Text>
              : handles.map((h) => (
                <Text key={h.handle_id} size="sm">{h.label}: <b>{h.details}</b></Text>
              ))}
          </Paper>
        )}
        <SegmentedControl
          fullWidth
          value={method}
          onChange={setMethod}
          data={['cash', 'transfer', 'other']}
        />
        <TextInput label="Note (optional)" value={note} onChange={(x) => setNote(x.target.value)} />
        <TextInput label="Proof ref (optional)" description="Transaction id after you paid" value={proofRef} onChange={(x) => setProofRef(x.target.value)} />
        <Button type="submit" loading={paying}>Record payment</Button>
        <Err e={e} />
      </Stack>
    </form>
  );
}
