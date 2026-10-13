import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, fmt } from '../api.js';
import { Err } from '../auth.jsx';
import { Net } from './Dashboard.jsx';
import { SettlementBox } from '../components/SettlementBox.jsx';
import { ExpenseForm, PaymentModal } from '../components/Forms.jsx';

export function GroupDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [detail, setDetail] = useState(null);
  const [ledger, setLedger] = useState(null);
  const [me, setMe] = useState(null);
  const [type, setType] = useState('all');
  const [q, setQ] = useState('');
  const [showExp, setShowExp] = useState(false);
  const [pay, setPay] = useState(null);
  const [email, setEmail] = useState('');
  const [cq, setCq] = useState('');
  const [contacts, setContacts] = useState([]);
  const [e, setE] = useState(null);

  const load = async () => {
    try {
      const [d, m] = await Promise.all([
        api.get(`/api/v1/groups/${id}`),
        api.get(`/api/v1/groups/${id}/me`),
      ]);
      setDetail(d); setMe(m); setE(null);
    } catch (err) { setE(err); }
  };
  const loadLedger = async () => {
    try {
      setLedger(await api.get(`/api/v1/groups/${id}/ledger?type=${type}&q=${encodeURIComponent(q)}`));
    } catch (err) { setE(err); }
  };
  useEffect(() => { load(); }, [id]);
  useEffect(() => { loadLedger(); }, [id, type]);

  const invite = async (ev) => {
    ev.preventDefault();
    try {
      const r = await api.post(`/api/v1/groups/${id}/invites`, { emails: [email] });
      alert(`added: ${r.added} pending: ${r.pending}`);
      setEmail('');
      load();
    } catch (err) { setE(err); }
  };
  const searchContacts = async (ev) => {
    ev.preventDefault();
    try { setContacts(await api.get(`/api/v1/contacts?q=${encodeURIComponent(cq)}`)); }
    catch (err) { setE(err); }
  };
  const addMember = async (uid) => {
    try {
      await api.post(`/api/v1/groups/${id}/members`, { user_ids: [uid] });
      load();
    } catch (err) { setE(err); }
  };
  const remove = async (uid) => {
    if (!confirm('Remove this member? Blocked while they hold a balance.')) return;
    try {
      await api.del(`/api/v1/groups/${id}/members/${uid}`);
      load();
    } catch (err) { setE(err); }
  };
  const rotate = async () => {
    try {
      const r = await api.post(`/api/v1/groups/${id}/rotate-invite`, {});
      prompt('New invite link (old one is dead):', r.invite_link);
    } catch (err) { setE(err); }
  };

  if (!detail) return (<div><Link to="/">←</Link><p>Loading…</p><Err e={e} /></div>);
  return (
    <div>
      <Link to="/">← groups</Link>
      <h2>{detail.name} <span className="muted">{detail.currency}</span></h2>
      {me && <p><Net v={me.net_cents} c={detail.currency} /></p>}
      <Err e={e} />
      <SettlementBox groupId={id} currency={detail.currency} onPay={(t) => setPay(t)} />
      {pay && <PaymentModal groupId={id} preset={pay} onClose={() => setPay(null)}
        onDone={(r) => { setPay(null); load(); loadLedger(); alert(r.fully_settled ? 'Fully settled! 🔒' : 'Recorded'); }} />}
      <p><button onClick={() => setPay({})}>Record payment / settle up</button>{' '}
        <button onClick={() => setShowExp(!showExp)}>{showExp ? 'Close' : '+ Expense'}</button></p>
      {showExp && <ExpenseForm groupId={id} members={detail.members}
        onDone={() => { setShowExp(false); load(); loadLedger(); }} />}

      <h3>Ledger</h3>
      <div className="row">
        <select value={type} onChange={(x) => setType(x.target.value)}>
          <option value="all">all</option><option value="expense">expenses</option><option value="payment">payments</option>
        </select>
        <input placeholder="search" value={q} onChange={(x) => setQ(x.target.value)} />
        <button onClick={loadLedger}>Go</button>
      </div>
      <ul>
        {ledger?.items.map((t) => (
          <li key={t.id}>
            {t.kind === 'expense'
              ? <><Link to={`/groups/${id}/expenses/${t.id}`}>{t.title}</Link> {fmt(t.amount_cents, detail.currency)} (my share {fmt(t.my_share_cents, detail.currency)}) [{t.status}]{t.has_image && ' 🧾'}</>
              : <>{t.title} {fmt(t.amount_cents, detail.currency)} [{t.status}]{t.reversed && ' (reversed)'}</>}
          </li>
        ))}
      </ul>
      {ledger && <p className="muted">{ledger.total} total</p>}

      <h3>Members</h3>
      <ul>
        {detail.members.map((m) => (
          <li key={m.user_id}>{m.display_name} @{m.username} ({m.role}){' '}
            {detail.my_role === 'owner' && <button onClick={() => remove(m.user_id)}>remove</button>}
          </li>
        ))}
      </ul>
      <form onSubmit={invite} className="row">
        <input placeholder="invite by email" value={email} onChange={(x) => setEmail(x.target.value)} />
        <button type="submit">Invite</button>
      </form>
      <form onSubmit={searchContacts} className="row">
        <input placeholder="contacts search" value={cq} onChange={(x) => setCq(x.target.value)} />
        <button type="submit">Search</button>
      </form>
      <ul>{contacts.map((c) => (
        <li key={c.user_id}>{c.display_name} @{c.username} <button onClick={() => addMember(c.user_id)}>add</button></li>
      ))}</ul>
      {detail.my_role === 'owner' && <p><button onClick={rotate}>New invite link (rotates)</button></p>}
      <p><button onClick={async () => {
        try { await api.post(`/api/v1/groups/${id}/leave`, {}); nav('/'); }
        catch (err) { setE(err); }
      }}>Leave group</button></p>
    </div>
  );
}
