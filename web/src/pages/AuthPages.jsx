import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Anchor, Button, PasswordInput, Stack, Text, TextInput, Title,
} from '@mantine/core';
import { useAuth, Err } from '../auth.jsx';
import { api, setTokens } from '../api.js';
import { BrandMark } from '../components/Shell.jsx';

// Sanitized in-app destination from ?next= (same-origin path only).
const safeNext = (search) => {
  const n = new URLSearchParams(search).get('next');
  return n && n.startsWith('/') && !n.startsWith('//') ? n : null;
};
const withNext = (path, next) => (next ? `${path}?next=${encodeURIComponent(next)}` : path);

function AuthBrand() {
  return (
    <Link to="/login" className="brand-logo is-light auth-brand" aria-label="SplitShare">
      <BrandMark size={28} />
      <span className="brand-word">SplitShare</span>
    </Link>
  );
}

function AuthLayout({ children }) {
  return (
    <div className="auth-page">
      <div className="auth-bg" aria-hidden>
        <span className="auth-orb auth-orb-a" />
        <span className="auth-orb auth-orb-b" />
        <span className="auth-orb auth-orb-c" />
        <span className="auth-grid" />
        <span className="auth-beam" />
      </div>
      <div className="auth-shell">
        <div className="auth-card">
          <AuthBrand />
          <div className="auth-body">{children}</div>
        </div>
      </div>
    </div>
  );
}

function AuthSubmit({ children, loading, icon = 'enter', ...props }) {
  return (
    <Button
      className="wizard-primary auth-submit"
      fullWidth
      type="submit"
      loading={loading}
      leftSection={!loading ? <AuthActionIcon name={icon} /> : undefined}
      {...props}
    >
      {children}
    </Button>
  );
}

function AuthActionIcon({ name }) {
  const common = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true };
  if (name === 'plus') {
    return (
      <svg {...common}>
        <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === 'mail') {
    return (
      <svg {...common} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.75" />
        <path d="m5.5 8 6.5 5 6.5-5" stroke="currentColor" strokeWidth="1.75" />
      </svg>
    );
  }
  if (name === 'lock') {
    return (
      <svg {...common} strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.75" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.75" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M14 5h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M10 16l4-4-4-4M4.5 12H14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const next = safeNext(location.search);
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [e, setE] = useState(null);
  const [busy, setBusy] = useState(false);
  const go = async (ev) => {
    ev.preventDefault();
    if (busy) return;
    setBusy(true);
    try { await login(id, pw); nav(next || '/'); } catch (err) { setE(err); } finally { setBusy(false); }
  };
  return (
    <AuthLayout>
      <Stack gap="md">
        <div className="auth-heading">
          <Title order={3} className="auth-title">Welcome back</Title>
          <Text size="sm" c="dimmed" className="auth-desc">Log in to continue</Text>
        </div>
        <form onSubmit={go}>
          <Stack gap="sm">
            <TextInput
              label="Username or email"
              required
              autoFocus
              autoComplete="username"
              name="username"
              value={id}
              onChange={(x) => setId(x.target.value)}
            />
            <PasswordInput
              label="Password"
              required
              autoComplete="current-password"
              name="password"
              value={pw}
              onChange={(x) => setPw(x.target.value)}
              onKeyDown={(ev) => { if (ev.key === 'Enter' && !busy) ev.currentTarget.form?.requestSubmit(); }}
            />
            <AuthSubmit loading={busy}>Log in</AuthSubmit>
          </Stack>
        </form>
        <Err e={e} />
        <GoogleBtn next={next} />
        <Text ta="center" size="sm" className="auth-links">
          <Anchor component={Link} to={withNext('/register', next)}>Register</Anchor>
          <span aria-hidden>·</span>
          <Anchor component={Link} to="/forgot">Forgot password?</Anchor>
        </Text>
      </Stack>
    </AuthLayout>
  );
}

export function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const next = safeNext(location.search);
  const [f, setF] = useState({ username: '', email: '', display_name: '', password: '' });
  const [e, setE] = useState(null);
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);
  const go = async (ev) => {
    ev.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const d = await register(f.username, f.email, f.display_name, f.password);
      setDone(d);
      nav(next || '/');
    } catch (err) { setE(err); } finally { setBusy(false); }
  };
  const set = (k) => (x) => setF({ ...f, [k]: x.target.value });
  return (
    <AuthLayout>
      <Stack gap="md">
        <div className="auth-heading">
          <Title order={3} className="auth-title">Create account</Title>
          <Text size="sm" c="dimmed" className="auth-desc">Start splitting with friends</Text>
        </div>
        <form onSubmit={go}>
          <Stack gap="sm">
            <TextInput label="Username" required value={f.username} onChange={set('username')} />
            <TextInput label="Email" required value={f.email} onChange={set('email')} />
            <TextInput label="Display name" required value={f.display_name} onChange={set('display_name')} />
            <PasswordInput label="Password" required value={f.password} onChange={set('password')} />
            <AuthSubmit loading={busy} icon="plus">Register</AuthSubmit>
          </Stack>
        </form>
        <Err e={e} />
        {done && done.auto_joined_groups?.length > 0 && (
          <Text size="sm">Auto-joined {done.auto_joined_groups.length} group(s) from email invites.</Text>
        )}
        <Text ta="center" size="sm" className="auth-links">
          <Anchor component={Link} to={withNext('/login', next)}>Back to login</Anchor>
        </Text>
      </Stack>
    </AuthLayout>
  );
}

function GoogleBtn({ next }) {
  const { setUser } = useAuth();
  const nav = useNavigate();
  const [e, setE] = useState(null);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) return null;
  const start = () => {
    // eslint-disable-next-line no-undef
    google.accounts.id.initialize({
      client_id: clientId,
      callback: async (resp) => {
        try {
          const d = await api.post('/api/v1/auth/google', { id_token: resp.credential });
          setTokens(d.access_token, d.refresh_token);
          setUser(d.user);
          nav(next || '/');
        } catch (err) { setE(err); }
      },
    });
    // eslint-disable-next-line no-undef
    google.accounts.id.prompt();
  };
  return (
    <>
      <Button className="wizard-back auth-google" fullWidth onClick={start}>
        Continue with Google
      </Button>
      <Err e={e} />
    </>
  );
}

export function Forgot() {
  const [email, setEmail] = useState('');
  const [e, setE] = useState(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const go = async (ev) => {
    ev.preventDefault();
    setBusy(true);
    try { await api.post('/api/v1/auth/forgot', { email }); setDone(true); setE(null); }
    catch (err) { setE(err); } finally { setBusy(false); }
  };
  return (
    <AuthLayout>
      <Stack gap="md">
        <div className="auth-heading">
          <Title order={3} className="auth-title">Reset password</Title>
          <Text size="sm" c="dimmed" className="auth-desc">We’ll email you a reset link</Text>
        </div>
        {done
          ? <Text size="sm">If that email exists, a reset link is on its way.</Text>
          : (
            <form onSubmit={go}>
              <Stack gap="sm">
                <TextInput label="Email" required value={email} onChange={(x) => setEmail(x.target.value)} />
                <AuthSubmit loading={busy} icon="mail">Send reset link</AuthSubmit>
              </Stack>
            </form>
          )}
        <Err e={e} />
        <Text ta="center" size="sm" className="auth-links">
          <Anchor component={Link} to="/login">Back to login</Anchor>
        </Text>
      </Stack>
    </AuthLayout>
  );
}

export function Reset() {
  const { setUser } = useAuth();
  const { token } = useParams();
  const nav = useNavigate();
  const [pw, setPw] = useState('');
  const [e, setE] = useState(null);
  const [busy, setBusy] = useState(false);
  const go = async (ev) => {
    ev.preventDefault();
    setBusy(true);
    try {
      const d = await api.post('/api/v1/auth/reset', { token, new_password: pw });
      setTokens(d.access_token, d.refresh_token);
      setUser(d.user);
      nav('/');
    } catch (err) { setE(err); } finally { setBusy(false); }
  };
  return (
    <AuthLayout>
      <Stack gap="md">
        <div className="auth-heading">
          <Title order={3} className="auth-title">New password</Title>
          <Text size="sm" c="dimmed" className="auth-desc">Choose a new password to sign in</Text>
        </div>
        <form onSubmit={go}>
          <Stack gap="sm">
            <PasswordInput label="New password" required value={pw} onChange={(x) => setPw(x.target.value)} />
            <AuthSubmit loading={busy} icon="lock">Set password</AuthSubmit>
          </Stack>
        </form>
        <Err e={e} />
      </Stack>
    </AuthLayout>
  );
}

export function Verify() {
  const { token } = useParams();
  const [msg, setMsg] = useState('Verifying…');
  useEffect(() => {
    api.post('/api/v1/auth/verify-email', { token })
      .then(() => setMsg('Email verified — you can now join groups.'))
      .catch((err) => setMsg(`Verification failed: ${err.message}`));
  }, [token]);
  return (
    <AuthLayout>
      <Stack gap="md">
        <div className="auth-heading">
          <Title order={3} className="auth-title">Email verification</Title>
        </div>
        <Text size="sm">{msg}</Text>
        <Text ta="center" size="sm" className="auth-links">
          <Anchor component={Link} to="/">Home</Anchor>
        </Text>
      </Stack>
    </AuthLayout>
  );
}
