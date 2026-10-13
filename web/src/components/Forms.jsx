import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Err } from '../auth.jsx';

// Expense create/edit with live split preview + un-settle confirm (tasks 8.2/8.3).
export function ExpenseForm({ groupId, members, existing, onDone }) {
  const [title, setTitle] = useState(existing?.title || '');
  const [amount, setAmount] = useState(existing ? (existing.amount_cents / 100).toFixed(2) : '');
  const [payer, setPayer] = useState(existing?.payer_id || members[0]?.user_id || '');
  const [type, setType] = useState(existing?.split_type || 'EQUAL');
  const [sel, setSel] = useState(() => new Set(
    existing ? existing.splits.map((s) => s.user_id) : members.map((m) => m.user_id)));
  const [detail, setDetail] = useState(''); // "id:val,id:val" for EXACT(amount)/PERCENT/SHARES
  const [preview, setPreview] = useState(null);
  const [confirm, setConfirm] = useState(null); // {names} un-settle list
  const [pending, setPending] = useState(null); // PATCH body awaiting confirm
  const [e, setE] = useState(null);

  const parseDetail = () => detail.split(',').map((p) => p.trim()).filter(Boolean).map((p) => {
    const [id, v] = p.split(':');
    return { id: id.trim(), v: Number(v) };
  });

  const build = () => {
    const parts = [...sel];
    const body = {
      title, amount: Number(amount), payer_id: payer, split_type: type, participant_ids: parts,
    };
    if (type === 'EXACT') body.exact = parseDetail().map((x) => ({ user_id: x.id, amount_cents: Math.round(x.v * 100) }));
    if (type === 'PERCENT') body.percent = parseDetail().map((x) => ({ user_id: x.id, percent: x.v }));
    if (type === 'SHARES') body.shares = parseDetail().map((x) => ({ user_id: x.id, shares: x.v }));
    return body;
  };

  useEffect(() => {
    if (!amount || sel.size === 0) { setPreview(null); return; }
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
  }, [amount, type, detail, payer, [...sel].join(',')]);

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
      if (err.code === 'STALE_VERSION') { setE(err); return; }
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
        const m = members.find((x) => x.user_id === id);
        const share = preview.shares?.[id] != null ? ` → ${(preview.shares[id] / 100).toFixed(2)}` : '';
        return `${m?.display_name || id.slice(0, 8)} ($0.00${share})`;
      });
      setPending(true);
      setConfirm(resolved);
      return;
    }
    setConfirm(null);
    setPending(null);
    await submit(ev);
  };

  const toggle = (id) => {
    const next = new Set(sel);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSel(next);
  };

  return (
    <form onSubmit={existing ? submitEdit : submit} className="card">
      <h3>{existing ? 'Edit expense' : 'New expense'}</h3>
      <input placeholder="Title" value={title} onChange={(x) => setTitle(x.target.value)} />
      <input placeholder="Amount" inputMode="decimal" value={amount} onChange={(x) => setAmount(x.target.value)} />
      <label>Payer
        <select value={payer} onChange={(x) => setPayer(x.target.value)}>
          {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}
        </select>
      </label>
      <div className="row">
        {['EQUAL', 'EXACT', 'PERCENT', 'SHARES'].map((t) => (
          <button type="button" key={t} className={type === t ? 'on' : ''} onClick={() => setType(t)}>{t}</button>
        ))}
      </div>
      {members.map((m) => (
        <label key={m.user_id}><input type="checkbox" checked={sel.has(m.user_id)} onChange={() => toggle(m.user_id)} /> {m.display_name}</label>
      ))}
      {type !== 'EQUAL' && (
        <input placeholder={type === 'EXACT' ? 'id:dollars, …' : type === 'PERCENT' ? 'id:percent, …' : 'id:shares, …'}
          value={detail} onChange={(x) => setDetail(x.target.value)} />
      )}
      {preview && (
        <div className="muted">
          Preview: {Object.entries(preview.shares || {}).map(([id, v]) => {
            const m = members.find((x) => x.user_id === id);
            return `${m?.display_name || id.slice(0, 8)} ${(v / 100).toFixed(2)}`;
          }).join(' · ')}
          {preview.unsettled_user_ids?.length > 0 && <b> — will un-settle {preview.unsettled_user_ids.length} member(s)</b>}
        </div>
      )}
      {confirm && (
        <div className="warnbox">
          This will un-settle: {confirm.join(', ')}. Continue?
          <div className="row"><button type="submit">Yes, save</button>
          <button type="button" onClick={() => { setConfirm(null); setPending(null); }}>Cancel</button></div>
        </div>
      )}
      {!confirm && <button type="submit">{existing ? 'Save' : 'Add expense'}</button>}
      <Err e={e} />
    </form>
  );
}

export function PaymentModal({ groupId, preset, onClose, onDone }) {
  const [from, setFrom] = useState(preset?.from_user_id || '');
  const [to, setTo] = useState(preset?.to_user_id || '');
  const [amount, setAmount] = useState(preset ? (preset.amount_cents / 100).toFixed(2) : '');
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
  return (
    <form onSubmit={go} className="card">
      <h3>Record payment</h3>
      <input placeholder="from user id" value={from} onChange={(x) => setFrom(x.target.value)} />
      <input placeholder="to user id" value={to} onChange={(x) => setTo(x.target.value)} />
      <input placeholder="amount" value={amount} onChange={(x) => setAmount(x.target.value)} />
      <select value={method} onChange={(x) => setMethod(x.target.value)}>
        <option>cash</option><option>transfer</option><option>other</option>
      </select>
      <input placeholder="note" value={note} onChange={(x) => setNote(x.target.value)} />
      <div className="row"><button type="submit">Record</button><button type="button" onClick={onClose}>Cancel</button></div>
      <Err e={e} />
    </form>
  );
}
