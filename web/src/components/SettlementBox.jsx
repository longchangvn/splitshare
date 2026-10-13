import { useEffect, useState } from 'react';
import { api, fmt } from '../api.js';
import { Err } from '../auth.jsx';

// Collapsible settlement explanation (spec §5/Why-box). Collapsed by default.
export function SettlementBox({ groupId, currency, onPay }) {
  const [plan, setPlan] = useState(null);
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState(false);
  const [hist, setHist] = useState([]);
  const [viewV, setViewV] = useState(null);
  const [e, setE] = useState(null);

  const load = () => api.get(`/api/v1/groups/${groupId}/settlement`).then((p) => { setPlan(p); setViewV(null); }).catch(setE);
  useEffect(() => { load(); }, [groupId]);

  const loadHist = async () => {
    try { setHist(await api.get(`/api/v1/groups/${groupId}/settlement/history`)); }
    catch (err) { setE(err); }
  };
  const view = viewV ? hist.find((h) => h.version === viewV) : plan;
  if (!view && !e) return <p>Loading settlement…</p>;

  const ex = view?.explanation || {};
  const transfers = view?.transfers || [];
  const historical = viewV !== null;
  return (
    <div className="settle">
      <button aria-expanded={open} onClick={() => setOpen(!open)} className="settle-head">
        {transfers.length === 0
          ? 'All settled 🎉 — nets all $0.00'
          : `Optimized: ${ex.raw_debts ?? '?'} debts → ${transfers.length} transfers (saved ${ex.saved ?? '?'}) • v${view?.version}`} ▸ Why?
      </button>
      {open && view && (
        <div>
          {historical && <p className="warn">Historical plan v{viewV} — read-only, not actionable.</p>}
          <h4>Net balances before</h4>
          <table>
            <tbody>
              {Object.entries(ex.before_nets || {}).map(([id, v]) => (
                <tr key={id}><td>{id.slice(0, 8)}</td><td>{fmt(v, currency)}</td></tr>
              ))}
            </tbody>
          </table>
          <h4>Steps</h4>
          <ol>{(ex.steps || []).map((s, i) => <li key={i}>{s}</li>)}</ol>
          <h4>Final transfers</h4>
          <ul>
            {transfers.map((t, i) => (
              <li key={i}>
                {t.from_user_id.slice(0, 8)} → {t.to_user_id.slice(0, 8)}: {fmt(t.amount_cents, currency)}{' '}
                {!historical && <button onClick={() => onPay(t)}>Pay</button>}
              </li>
            ))}
          </ul>
          <p className="muted">v{view.version} · {view.computed_at} · {view.inputs_hash}</p>
          <button onClick={() => setRaw(!raw)}>{raw ? 'Hide' : 'View'} raw debts (unoptimized)</button>
          {raw && <p className="muted">Raw view: {ex.raw_debts} participant-share debts collapsed into {transfers.length} transfers.</p>}
          <div>
            <button onClick={loadHist}>History</button>{' '}
            <button onClick={load}>Refresh</button>
          </div>
          {hist.length > 0 && (
            <select value={viewV ?? ''} onChange={(x) => setViewV(x.target.value ? Number(x.target.value) : null)}>
              <option value="">current</option>
              {hist.map((h) => <option key={h.version} value={h.version}>v{h.version} · {h.computed_at}</option>)}
            </select>
          )}
          <Err e={e} />
        </div>
      )}
    </div>
  );
}
