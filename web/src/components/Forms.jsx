import { useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Group, Select, Stack, Text, TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { api, fmt } from '../api.js';
import { Err, useAuth } from '../auth.jsx';
import { displayNameOf } from './Net.jsx';

const splitVal = (s, type) => {
  if (!s) return '';
  if (type === 'EXACT' && s.exact_cents != null) return (s.exact_cents / 100).toString();
  if (type === 'PERCENT' && s.percent != null) return s.percent.toString();
  if (type === 'SHARES' && s.shares != null) return s.shares.toString();
  return '';
};

// Shorten long filenames for the staged list (keep start + extension).
const shortName = (name) => {
  if (!name || name.length <= 28) return name || '';
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot) : '';
  const base = dot > 0 ? name.slice(0, dot) : name;
  const keep = Math.max(0, 26 - ext.length);
  return `${base.slice(0, Math.min(18, keep))}…${base.slice(-Math.max(0, keep - 18))}${ext}`;
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
  const { user } = useAuth();
  const meId = user?.user_id || '';
  const source = existing ?? copyFrom ?? null;
  const isCopy = !!copyFrom && !existing;
  const activeIds = new Set(members.map((m) => m.user_id));
  // Payer options always show the display name (username only as last resort).
  const payerData = members.map((m) => ({
    value: m.user_id,
    label: m.display_name || m.username || String(m.user_id).slice(0, 8),
  }));

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
    if (type === 'SHARES') {
      for (const id of sel) out[id] = '1';
    }
    if (!source || !source.splits) return out;
    for (const s of source.splits) {
      if (!sel.includes(s.user_id)) continue;
      const v = splitVal(s, type);
      if (v !== '') out[s.user_id] = v;
      else if (type === 'SHARES' && !(s.user_id in out)) out[s.user_id] = '1';
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
    // Default to me (copy falls back to me when the original payer left).
    if (meId && activeIds.has(meId)) return meId;
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

  // Members (and/or the session user) can land after mount — backfill the payer
  // with me, else the first member, so the field is never stuck empty.
  useEffect(() => {
    if (payer || activeIds.size === 0) return;
    setPayer(activeIds.has(meId) ? meId : members[0]?.user_id || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payer, meId, members]);

  const dropped = copyFrom
    ? copyFrom.splits.map((s) => s.user_id).filter((id) => !activeIds.has(id))
    : [];
  // Copy expense never carries receipts: the upload section starts empty.

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
      if (id in stashed) {
        setValues((prev) => ({ ...prev, [id]: stashed[id] }));
      } else if (type === 'SHARES') {
        // New participant in SHARES mode defaults to 1 share (not empty/0).
        setValues((prev) => ({ ...prev, [id]: prev[id] ?? '1' }));
      }
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
      // Empty box means 1 share (avoids 0 -> 422 dead-end).
      body.shares = sel.map((id) => ({
        user_id: id,
        shares: values[id] === '' || values[id] == null ? 1 : Math.max(1, Math.round(Number(values[id] || 1))),
      }));
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

  // Staged receipts for create: picked now, uploaded only on Save.
  const [staged, setStaged] = useState([]);
  const fileRef = useRef(null);
  const RECEIPT_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif';
  const maxStaged = 5;
  const onPickFiles = (ev) => {
    const picked = Array.from(ev.target.files || []);
    ev.target.value = '';
    if (picked.length === 0) return;
    const ok = [];
    for (const f of picked) {
      if (f.size > 10 * 1024 * 1024) {
        setE({ message: `${f.name}: over 10MB.` });
        continue;
      }
      ok.push(f);
    }
    setStaged((prev) => [...prev, ...ok].slice(0, Math.max(0, maxStaged)));
  };
  const uploadStaged = async (newExpenseId) => {
    const failures = [];
    for (const file of staged) {
      try {
        const form = new FormData();
        form.append('file', file, file.name);
        await api.postForm(`/api/v1/expenses/${newExpenseId}/images`, form);
      } catch (err) {
        failures.push(`${file.name}: ${err.message}`);
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
        if (newId && staged.length > 0) {
          const failures = await uploadStaged(newId);
          if (failures.length > 0) {
            setImgErrs(failures);
            notifications.show({ title: 'Expense saved; some receipts failed', message: failures.join('; '), color: 'orange' });
          } else {
            notifications.show({ title: 'Expense saved with receipts', color: 'teal' });
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

  // Receipt strip: staged (create) or existing images (edit).
  const receiptCount = existing
    ? (source?.images?.length || 0)
    : staged.length;

  // EQUAL explainer: floor + remainder 1¢, who gets +1¢.
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

  const splitTypes = ['EQUAL', 'EXACT', 'PERCENT', 'SHARES'];

  return (
    <form className="wizard-form" onSubmit={existing ? submitEdit : submit}>
      {isCopy && dropped.length > 0 && (
        <Alert color="yellow" variant="light" title="Former members excluded from the copy">
          <Text size="sm">{dropped.map((id) => id.slice(0, 8)).join(', ')}</Text>
        </Alert>
      )}

      <section className="wizard-section">
        <h3 className="wizard-section-title">Basics</h3>
        <div className="wizard-person" style={{ alignItems: 'stretch', flexDirection: 'column', gap: 8 }}>
          <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
            {receiptCount > 0 ? (
              Array.from({ length: Math.min(receiptCount, 3) }).map((_, i) => (
                <Box key={i} w={40} h={40} style={{ background: '#fff4e5', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flex: 'none' }} aria-hidden>🧾</Box>
              ))
            ) : (
              <Box w={40} h={40} style={{ border: '1.5px dashed #d7e2dc', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: '#8a938f', flex: 'none' }} aria-hidden>＋</Box>
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              <Text size="sm" fw={600}>{receiptCount}/5 receipts</Text>
              <Text size="xs" c="dimmed">
                {existing
                  ? 'Manage on the expense page.'
                  : 'Added now, uploaded on Save · jpg/png/webp/heic ≤10MB'}
              </Text>
            </div>
            {!existing && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept={RECEIPT_ACCEPT}
                  multiple
                  style={{ display: 'none' }}
                  onChange={onPickFiles}
                />
                <Button size="xs" variant="light" style={{ flex: 'none' }} disabled={maxStaged <= 0 || staged.length >= maxStaged} onClick={() => fileRef.current?.click()}>
                  Add receipt{maxStaged <= 0 || staged.length >= maxStaged ? ' (full)' : ''}
                </Button>
              </>
            )}
          </Group>
          {!existing && staged.length > 0 && (
            <Stack gap={4}>
              {staged.map((f, i) => (
                <Group key={`${f.name}-${f.size}-${i}`} gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                  <Text size="xs" style={{ flex: 1, minWidth: 0 }} truncate title={f.name}>🧾 {shortName(f.name)}</Text>
                  <Text size="xs" c="dimmed" style={{ flex: 'none' }}>{(f.size / 1024).toFixed(0)}KB</Text>
                  <Button size="xs" variant="subtle" color="red" style={{ flex: 'none' }} onClick={() => setStaged(staged.filter((_, j) => j !== i))}>X</Button>
                </Group>
              ))}
              <Text size="xs" c="dimmed">Uploads when you click {isCopy ? 'Save copy' : 'Add expense'}.</Text>
            </Stack>
          )}
        </div>
        <TextInput label="Title" required placeholder="Dinner" value={title} onChange={(x) => setTitle(x.target.value)} />
        <TextInput label="Amount" required inputMode="decimal" placeholder="0.00" value={amount} onChange={(x) => setAmount(x.target.value)} />
        <Group gap="xs" grow>
          <Select
            label="Category"
            value={category}
            onChange={setCategory}
            data={CATS}
            comboboxProps={{ withinPortal: true }}
          />
          <TextInput label="Spent on" type="date" value={spentAt} onChange={(x) => setSpentAt(x.target.value)} />
        </Group>
        <Select
          label="Payer"
          value={payer || null}
          onChange={(v) => setPayer(v || '')}
          data={payerData}
          comboboxProps={{ withinPortal: true }}
        />
      </section>

      <details className="wizard-section">
        <summary className="wizard-section-title" style={{ cursor: 'pointer' }}>Bill details (optional)</summary>
        <Group gap="xs" grow>
          <TextInput label="Tax (opt)" inputMode="decimal" placeholder="0.00" value={tax} onChange={(x) => setTax(x.target.value)} />
          <TextInput label="Tip (opt)" inputMode="decimal" placeholder="0.00" value={tip} onChange={(x) => setTip(x.target.value)} />
          <TextInput label="Fee (opt)" inputMode="decimal" placeholder="0.00" value={fee} onChange={(x) => setFee(x.target.value)} />
        </Group>
        <div className="wizard-field">
          <span className="wizard-label">Foreign currency (optional)</span>
          <Group gap="xs" grow>
            <TextInput placeholder="JPY" value={origCur} onChange={(x) => setOrigCur(x.target.value)} />
            <TextInput placeholder="Amount" inputMode="decimal" value={origAmt} onChange={(x) => setOrigAmt(x.target.value)} />
            <TextInput placeholder="Rate" inputMode="decimal" value={fxRate} onChange={(x) => setFxRate(x.target.value)} />
          </Group>
          {origCur.trim() !== '' && origAmt !== '' && fxRate !== '' && !Number.isNaN(Number(origAmt) * Number(fxRate)) && (
            <Text size="xs" c="dimmed" mt={6}>≈ {(Number(origAmt) * Number(fxRate)).toFixed(2)} in group currency</Text>
          )}
        </div>
        <div className="wizard-field">
          <Group justify="space-between" mb={6}>
            <span className="wizard-label" style={{ marginBottom: 0 }}>Guest shares (optional)</span>
            <button
              type="button"
              className="wizard-chip"
              onClick={() => setGuests([...guests, { label: '', amount: '', covered_by: sel[0] || payer }])}
            >
              + Guest
            </button>
          </Group>
          {guests.map((g, i) => (
            <Group key={i} gap="xs" mb={6} wrap="nowrap">
              <TextInput placeholder="Label" value={g.label} style={{ flex: 2 }}
                onChange={(x) => setGuests(guests.map((gg, j) => (j === i ? { ...gg, label: x.target.value } : gg)))} />
              <TextInput placeholder="$" inputMode="decimal" value={g.amount} style={{ flex: 1 }}
                onChange={(x) => setGuests(guests.map((gg, j) => (j === i ? { ...gg, amount: x.target.value } : gg)))} />
              <Select
                value={g.covered_by}
                style={{ flex: 2 }}
                onChange={(v) => setGuests(guests.map((gg, j) => (j === i ? { ...gg, covered_by: v } : gg)))}
                data={payerData}
                comboboxProps={{ withinPortal: true }}
              />
              <Button size="xs" variant="subtle" color="red" onClick={() => setGuests(guests.filter((_, j) => j !== i))}>X</Button>
            </Group>
          ))}
          {guests.length === 0 && (
            <Text size="xs" c="dimmed">Extra mouths covered by a member (on top of their share).</Text>
          )}
        </div>
        <Checkbox
          checked={onlyPresent}
          onChange={(x) => setOnlyPresent(x.currentTarget.checked)}
          label="Only members present (joined before spent date)"
        />
      </details>

      <section className="wizard-section">
        <h3 className="wizard-section-title">Split</h3>
        <div className="wizard-field">
          <span className="wizard-label">Method</span>
          <div className="wizard-chips" role="radiogroup" aria-label="Split type">
            {splitTypes.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                className={type === t ? 'wizard-chip is-on' : 'wizard-chip'}
                aria-checked={type === t}
                onClick={() => changeType(t)}
              >
                {t.charAt(0) + t.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>
        {equalNote && (
          <Text size="xs" c="dimmed">{equalNote}</Text>
        )}
        <div className="wizard-field">
          <span className="wizard-label">Participants</span>
          <Stack gap={8}>
            {members.map((m) => (
              <div key={m.user_id} className="wizard-person">
                <Checkbox
                  checked={sel.includes(m.user_id)}
                  onChange={() => toggle(m.user_id)}
                  label={m.display_name}
                />
                {type !== 'EQUAL' && sel.includes(m.user_id) && (
                  <TextInput
                    className="split-value"
                    aria-label={`${boxLabel} for ${m.display_name}`}
                    placeholder={type === 'SHARES' ? '1' : boxLabel}
                    inputMode={type === 'SHARES' ? 'numeric' : 'decimal'}
                    min={type === 'SHARES' ? 1 : undefined}
                    value={values[m.user_id] ?? (type === 'SHARES' ? '1' : '')}
                    onChange={(x) => setVal(m.user_id, x.target.value)}
                    style={{ width: 110 }}
                  />
                )}
              </div>
            ))}
          </Stack>
        </div>
        {type !== 'EQUAL' && totals && (
          <Text size="sm" c={totals.ok ? 'teal' : 'orange'}>{totals.text}</Text>
        )}
        {preview && (
          <div className="wizard-person" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <Text size="sm" fw={600}>Live preview</Text>
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
          </div>
        )}
      </section>

      {confirm && (
        <Alert color="orange" variant="light" title="This will un-settle the following members">
          <Text size="sm" mb="xs">{confirm.join(', ')}. Continue?</Text>
          <Group gap="xs">
            <Button className="wizard-primary" size="sm" type="submit" loading={saving}>Yes, save</Button>
            <Button className="wizard-back" size="sm" onClick={() => { setConfirm(null); setPending(null); }}>
              Cancel
            </Button>
          </Group>
        </Alert>
      )}
      {!confirm && (
        <Button
          className="wizard-primary"
          fullWidth
          type="submit"
          loading={saving}
        >
          {existing ? 'Save changes' : isCopy ? 'Save copy' : 'Add expense'}
        </Button>
      )}
      {imgErrs.length > 0 && (
        <Alert color="orange" variant="light" title="Receipt carry-over failed">
          <Text size="sm">{imgErrs.join('; ')}</Text>
        </Alert>
      )}
      <Err e={e} />
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
  const methods = ['cash', 'transfer', 'other'];
  return (
    <form className="wizard-form" onSubmit={go}>
      <section className="wizard-section">
        <h3 className="wizard-section-title">Transfer</h3>
        <Select
          label="From"
          required
          searchable
          value={from || null}
          onChange={(v) => setFrom(v || '')}
          data={data}
          comboboxProps={{ withinPortal: true }}
        />
        <Select
          label="To"
          required
          searchable
          value={to || null}
          onChange={(v) => setTo(v || '')}
          data={data}
          comboboxProps={{ withinPortal: true }}
        />
        <TextInput
          label="Amount"
          required
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          onChange={(x) => setAmount(x.target.value)}
        />
        {to && (
          <div className="wizard-person" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <Text size="sm" fw={600}>Pay {toName}{amount ? ` · ${amount}` : ''}</Text>
            {handles.length === 0
              ? <Text size="xs" c="dimmed">No payment accounts on file — ask {toName} to add one in Profile.</Text>
              : handles.map((h) => (
                <Text key={h.handle_id} size="sm">{h.label}: <b>{h.details}</b></Text>
              ))}
          </div>
        )}
      </section>
      <section className="wizard-section">
        <h3 className="wizard-section-title">Details</h3>
        <div className="wizard-field">
          <span className="wizard-label">Method</span>
          <div className="wizard-chips" role="radiogroup" aria-label="Payment method">
            {methods.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                className={method === m ? 'wizard-chip is-on' : 'wizard-chip'}
                aria-checked={method === m}
                onClick={() => setMethod(m)}
              >
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <TextInput
          label="Note (optional)"
          placeholder="Dinner repayment"
          value={note}
          onChange={(x) => setNote(x.target.value)}
        />
        <TextInput
          label="Proof ref (optional)"
          description="Transaction id after you paid"
          placeholder="TXN-123"
          value={proofRef}
          onChange={(x) => setProofRef(x.target.value)}
        />
      </section>
      <Button className="wizard-primary" fullWidth type="submit" loading={paying}>Record payment</Button>
      <Err e={e} />
    </form>
  );
}
