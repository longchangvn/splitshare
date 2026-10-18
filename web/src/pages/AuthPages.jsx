import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Anchor, Button, PasswordInput, Stack, Text, TextInput, Title,
} from '@mantine/core';
import { useAuth, Err } from '../auth.jsx';
import { api, setTokens } from '../api.js';
import { BrandMark } from '../components/Shell.jsx';
import { useT } from '../prefs.jsx';

function AuthBrand() {
  const t = useT();
  return (
    <Link to="/login" className="brand-logo is-light auth-brand" aria-label={t('shell.brand')}>
      <BrandMark size={28} />
      <span className="brand-word">{t('shell.brand')}</span>
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
  const t = useT();
  const { login } = useAuth();
  const nav = useNavigate();
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [e, setE] = useState(null);
  const [busy, setBusy] = useState(false);
  const go = async (ev) => {
    ev.preventDefault();
    if (busy) return;
    setBusy(true);
    try { await login(id, pw); nav('/'); } catch (err) { setE(err); } finally { setBusy(false); }
  };
  return (
    <AuthLayout>
      <Stack gap="md">
        <div className="auth-heading">
          <Title order={3} className="auth-title">{t('auth.welcomeBack')}</Title>
          <Text size="sm" c="dimmed" className="auth-desc">{t('auth.loginContinue')}</Text>
        </div>
        <form onSubmit={go}>
          <Stack gap="sm">
            <TextInput
              label={t('auth.usernameOrEmail')}
              required
              autoFocus
              autoComplete="username"
              name="username"
              value={id}
              onChange={(x) => setId(x.target.value)}
            />
            <PasswordInput
              label={t('auth.password')}
              required
              autoComplete="current-password"
              name="password"
              value={pw}
              onChange={(x) => setPw(x.target.value)}
              onKeyDown={(ev) => { if (ev.key === 'Enter' && !busy) ev.currentTarget.form?.requestSubmit(); }}
            />
            <AuthSubmit loading={busy}>{t('auth.logIn')}</AuthSubmit>
          </Stack>
        </form>
        <Err e={e} />
        <GoogleBtn />
        <Text ta="center" size="sm" className="auth-links">
          <Anchor component={Link} to="/register">{t('auth.register')}</Anchor>
          <span aria-hidden>·</span>
          <Anchor component={Link} to="/forgot">{t('auth.forgotPassword')}</Anchor>
        </Text>
      </Stack>
    </AuthLayout>
  );
}

export function Register() {
  const t = useT();
  const { register } = useAuth();
  const nav = useNavigate();
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
      nav('/');
    } catch (err) { setE(err); } finally { setBusy(false); }
  };
  const set = (k) => (x) => setF({ ...f, [k]: x.target.value });
  return (
    <AuthLayout>
      <Stack gap="md">
        <div className="auth-heading">
          <Title order={3} className="auth-title">{t('auth.createAccount')}</Title>
          <Text size="sm" c="dimmed" className="auth-desc">{t('auth.startSplitting')}</Text>
        </div>
        <form onSubmit={go}>
          <Stack gap="sm">
            <TextInput label={t('auth.username')} required value={f.username} onChange={set('username')} />
            <TextInput label={t('auth.email')} required value={f.email} onChange={set('email')} />
            <TextInput label={t('auth.displayName')} required value={f.display_name} onChange={set('display_name')} />
            <PasswordInput label={t('auth.password')} required value={f.password} onChange={set('password')} />
            <AuthSubmit loading={busy} icon="plus">{t('auth.register')}</AuthSubmit>
          </Stack>
        </form>
        <Err e={e} />
        {done && done.auto_joined_groups?.length > 0 && (
          <Text size="sm">{t('auth.autoJoined', { count: done.auto_joined_groups.length })}</Text>
        )}
        <Text ta="center" size="sm" className="auth-links">
          <Anchor component={Link} to="/login">{t('auth.backToLogin')}</Anchor>
        </Text>
      </Stack>
    </AuthLayout>
  );
}

function GoogleBtn() {
  const t = useT();
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
          nav('/');
        } catch (err) { setE(err); }
      },
    });
    // eslint-disable-next-line no-undef
    google.accounts.id.prompt();
  };
  return (
    <>
      <Button className="wizard-back auth-google" fullWidth onClick={start}>
        {t('auth.continueGoogle')}
      </Button>
      <Err e={e} />
    </>
  );
}

export function Forgot() {
  const t = useT();
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
          <Title order={3} className="auth-title">{t('auth.resetPassword')}</Title>
          <Text size="sm" c="dimmed" className="auth-desc">{t('auth.resetHint')}</Text>
        </div>
        {done
          ? <Text size="sm">{t('auth.resetSent')}</Text>
          : (
            <form onSubmit={go}>
              <Stack gap="sm">
                <TextInput label={t('auth.email')} required value={email} onChange={(x) => setEmail(x.target.value)} />
                <AuthSubmit loading={busy} icon="mail">{t('auth.sendResetLink')}</AuthSubmit>
              </Stack>
            </form>
          )}
        <Err e={e} />
        <Text ta="center" size="sm" className="auth-links">
          <Anchor component={Link} to="/login">{t('auth.backToLogin')}</Anchor>
        </Text>
      </Stack>
    </AuthLayout>
  );
}

export function Reset() {
  const t = useT();
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
          <Title order={3} className="auth-title">{t('auth.newPassword')}</Title>
          <Text size="sm" c="dimmed" className="auth-desc">{t('auth.chooseNewPassword')}</Text>
        </div>
        <form onSubmit={go}>
          <Stack gap="sm">
            <PasswordInput label={t('auth.newPassword')} required value={pw} onChange={(x) => setPw(x.target.value)} />
            <AuthSubmit loading={busy} icon="lock">{t('auth.setPassword')}</AuthSubmit>
          </Stack>
        </form>
        <Err e={e} />
      </Stack>
    </AuthLayout>
  );
}

export function Verify() {
  const t = useT();
  const { token } = useParams();
  const [msg, setMsg] = useState(() => t('auth.verifying'));
  useEffect(() => {
    api.post('/api/v1/auth/verify-email', { token })
      .then(() => setMsg(t('auth.emailVerified')))
      .catch((err) => setMsg(t('auth.verificationFailed', { message: err.message })));
  }, [token, t]);
  return (
    <AuthLayout>
      <Stack gap="md">
        <div className="auth-heading">
          <Title order={3} className="auth-title">{t('auth.emailVerification')}</Title>
        </div>
        <Text size="sm">{msg}</Text>
        <Text ta="center" size="sm" className="auth-links">
          <Anchor component={Link} to="/">{t('common.home')}</Anchor>
        </Text>
      </Stack>
    </AuthLayout>
  );
}
