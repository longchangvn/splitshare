import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, fmt } from '../api.js';
import { useAuth, Err } from '../auth.jsx';

export function Dashboard() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [e, setE] = useState(null);
  const [name, setName] = useState('');
  const [cur, setCur] = useState('USD');

  const load = () => api.get('/api/v1/me/balances').then(setData).catch(setE);
  useEffect(() => { load(); }, []);

  const create = async (ev) => {
    ev.preventDefault();
    try {
      const g = await api.post('/api/v1/groups', { name, currency: cur });
      nav(`/groups/${g.group_id}`);
    } catch (err) { setE(err); }
  };

  return (
    <div>
      <header className="bar">
        <b>SplitShare</b>
        <span>{user?.display_name} ({user?.username}) {!user?.email_verified && <i>unverified email</i>}</span>
        <button onClick={async () => { await logout(); window.location.reload(); }}>Logout</button>
      </header>
      <Err e={e} />
      <h3>What you owe</h3>
      {data && Object.entries(data.totals).map(([c, t]) => (
        <p key={c}>{c}: owe <b className="neg">{fmt(t.owe_cents, c)}</b> · owed <b className="pos">{fmt(t.owed_cents, c)}</b></p>
      ))}
      {data && data.groups.length === 0 && <p className="muted">No groups yet — create one below.</p>}
      <ul>
        {data?.groups.map((g) => (
          <li key={g.group_id}>
            <Link to={`/groups/${g.group_id}`}>{g.name}</Link>{' '}
            <Net v={g.net_cents} c={g.currency} />
            {g.delinquent && <span className="warn"> · unsettled 30d+</span>}
          </li>
        ))}
      </ul>
      <h3>New group</h3>
      <form onSubmit={create} className="row">
        <input placeholder="Trip to Alps (3-50 chars)" value={name} onChange={(x) => setName(x.target.value)} />
        <input placeholder="USD" value={cur} onChange={(x) => setCur(x.target.value)} style={{ width: 70 }} />
        <button type="submit">Create</button>
      </form>
    </div>
  );
}

export function Net({ v, c }) {
  if (v === 0) return <span className="muted">settled up</span>;
  return v < 0
    ? <span className="neg">you owe {fmt(-v, c)}</span>
    : <span className="pos">you are owed {fmt(v, c)}</span>;
}
