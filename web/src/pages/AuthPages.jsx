import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, Err } from '../auth.jsx';
import { api, setTokens } from '../api.js';

export function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [e, setE] = useState(null);
  const go = async (ev) => {
    ev.preventDefault();
    try { await login(id, pw); nav('/'); } catch (err) { setE(err); }
  };
  return (
    <div className="card">
      <h2>Log in</h2>
      <form onSubmit={go}>
        <input placeholder="username or email" value={id} onChange={(x) => setId(x.target.value)} />
        <input placeholder="password" type="password" value={pw} onChange={(x) => setPw(x.target.value)} />
        <button type="submit">Log in</button>
      </form>
      <Err e={e} />
      <p><Link to="/register">Register</Link> · <GoogleBtn /></p>
    </div>
  );
}

export function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ username: '', email: '', display_name: '', password: '' });
  const [e, setE] = useState(null);
  const [done, setDone] = useState(null);
  const go = async (ev) => {
    ev.preventDefault();
    try {
      const d = await register(f.username, f.email, f.display_name, f.password);
      setDone(d);
      nav('/');
    } catch (err) { setE(err); }
  };
  const set = (k) => (x) => setF({ ...f, [k]: x.target.value });
  return (
    <div className="card">
      <h2>Register</h2>
      <form onSubmit={go}>
        <input placeholder="username" value={f.username} onChange={set('username')} />
        <input placeholder="email" value={f.email} onChange={set('email')} />
        <input placeholder="display name" value={f.display_name} onChange={set('display_name')} />
        <input placeholder="password (8+ chars, letter+digit)" type="password" value={f.password} onChange={set('password')} />
        <button type="submit">Register</button>
      </form>
      <Err e={e} />
      {done && done.auto_joined_groups?.length > 0 && <p>Auto-joined {done.auto_joined_groups.length} group(s) from email invites.</p>}
      <p><Link to="/login">Back to login</Link></p>
    </div>
  );
}

function GoogleBtn() {
  const { setUser } = useAuth();
  const nav = useNavigate();
  const [e, setE] = useState(null);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) return <span className="muted">Google login needs VITE_GOOGLE_CLIENT_ID</span>;
  const start = () => {
    // eslint-disable-next-line no-undef
    google.accounts.id.initialize({
      client_id: clientId,
      callback: async (resp) => {
        try {
          const d = await api.post('/api/v1/auth/google', { id_token: resp.credential });
          setTokens(d.access_token, d.refresh_token);
          setUser(d.user);
          nav('/');
        } catch (err) { setE(err); }
      },
    });
    // eslint-disable-next-line no-undef
    google.accounts.id.prompt();
  };
  return (<span><button onClick={start}>Continue with Google</button><Err e={e} /></span>);
}
