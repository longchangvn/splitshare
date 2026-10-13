import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, fmt } from '../api.js';
import { Err } from '../auth.jsx';
import { ExpenseForm } from '../components/Forms.jsx';

export function ExpenseDetail() {
  const { id, eid } = useParams();
  const nav = useNavigate();
  const [d, setD] = useState(null);
  const [members, setMembers] = useState([]);
  const [edit, setEdit] = useState(false);
  const [e, setE] = useState(null);

  const load = async () => {
    try {
      const [det, g] = await Promise.all([
        api.get(`/api/v1/expenses/${eid}`),
        api.get(`/api/v1/groups/${id}`).catch(() => null),
      ]);
      setD(det);
      if (g) setMembers(g.members);
    } catch (err) { setE(err); }
  };
  useEffect(() => { load(); }, [eid]);

  const del = async () => {
    if (!confirm('Delete this expense? Balances recompute.')) return;
    try { await api.del(`/api/v1/expenses/${eid}`); nav(`/groups/${id}`); }
    catch (err) { setE(err); }
  };
  const upload = async (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    const form = new FormData();
    form.append('file', f);
    try {
      await api.postForm(`/api/v1/expenses/${eid}/images`, form);
      load();
    } catch (err) { setE(err); }
  };
  const delImg = async (iid) => {
    try { await api.del(`/api/v1/images/${iid}`); load(); } catch (err) { setE(err); }
  };

  if (!d) return (<div><p>Loading…</p><Err e={e} /></div>);
  const x = d.expense;
  return (
    <div>
      <Link to={`/groups/${id}`}>← group</Link>
      <h2>{x.title} [{x.status}]</h2>
      <p>{x.description}</p>
      <p>Total {fmt(x.amount_cents, '')} · v{x.version} · settlement v{d.settlement_version}</p>
      <Err e={e} />
      <h4>Splits</h4>
      <ul>{x.splits.map((s) => <li key={s.user_id}>{s.user_id.slice(0, 8)}: {fmt(s.share_cents, '')}</li>)}</ul>
      {!edit
        ? <p><button onClick={() => setEdit(true)}>Edit</button> <button onClick={del}>Delete</button></p>
        : <ExpenseForm groupId={id} members={members} existing={x}
            onDone={() => { setEdit(false); load(); }} />}
      <h4>Receipts</h4>
      <input type="file" accept="image/*" onChange={upload} />
      <ul>{x.images.map((i) => (
        <li key={i.image_id}>
          <ImgView id={i.image_id} mime={i.mime} size={i.size_bytes} />{' '}
          <button onClick={() => delImg(i.image_id)}>delete</button>
        </li>
      ))}</ul>
      <h4>History</h4>
      <ul>{d.audit.map((a, i) => <li key={i}>{a.at}: {JSON.stringify(a.diff)}</li>)}</ul>
    </div>
  );
}

// Images are auth-gated: fetch as blob with the Bearer token.
function ImgView({ id, mime, size }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let live = true;
    (async () => {
      const r = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/images/${id}`,
        { headers: { Authorization: `Bearer ${localStorage.getItem('ss_at')}` } });
      if (!r.ok) return;
      const blob = await r.blob();
      if (live) setUrl(URL.createObjectURL(blob));
    })();
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  if (!url) return <span className="muted">{mime} {(size / 1024).toFixed(1)}KB…</span>;
  return <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="receipt" style={{ maxWidth: 120 }} /></a>;
}

export function JoinPage() {  const { token } = useParams();
  const nav = useNavigate();
  const [msg, setMsg] = useState('Joining…');
  useEffect(() => {
    api.post('/api/v1/groups/join', { token })
      .then((r) => nav(`/groups/${r.group_id}`))
      .catch((err) => setMsg(`Join failed: ${err.code || ''} ${err.message}`));
  }, [token, nav]);
  return (<div><p>{msg}</p><p><Link to="/">Home</Link></p></div>);
}
