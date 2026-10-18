import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Anchor, Button, PasswordInput, Stack, Text, TextInput, Title,
} from '@mantine/core';
import { useAuth, Err } from '../auth.jsx';
import { api, setTokens } from '../api.js';
import { takePending, PING, makeNonce, REDIRECT_FLOW_KEY } from '../googleReturn.js';
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
        <GoogleBtn next={next} intent="signin" />
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
        <GoogleBtn next={next} intent="signup" />
        <Text ta="center" size="sm" className="auth-links">
          <Anchor component={Link} to={withNext('/login', next)}>Back to login</Anchor>
        </Text>
      </Stack>
    </AuthLayout>
  );
}

// One Tap lives in a third-party iframe that mobile browsers throttle or block,
// and on mobile window.open opens a *tab that takes focus*, backgrounding the
// page that started the flow. Skipping One Tap there is both more reliable and
// faster: the popup is full-screen, so it reads like a normal redirect.
// iPadOS 13+ claims a desktop UA, hence the maxTouchPoints check.
const isMobile = () => {
  const ua = navigator.userAgent || '';
  return /Android|iPhone|iPad|iPod|Mobile|Silk/i.test(ua)
    || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
};

// Official Google "G" mark (48px grid, brand colors). Sized via CSS/attr.
function GoogleGIcon() {
  return (
    <svg className="google-g" width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

// Shared SSO block: "or" divider + Google button. intent picks the Google
// brand label ("Sign in" on login, "Sign up" on register).
//
// Flow:
//   - desktop -> prime a popup *synchronously inside the click gesture* (a
//     deferred OAuth navigation 3s later is only allowed on a window that is
//     already open), then One Tap first; when it answers with nothing — the
//     norm under Safari's ITP — navigate that primed window to OAuth;
//   - mobile  -> no popup at all: redirect this tab straight to Google. Nothing
//     to popup-block, no backgrounded tab waiting on timers.
// Either way googleReturn.js hands the token back from the document Google
// returns to, rather than this page polling for it.
function GoogleBtn({ next, intent = 'signin' }) {
  const { setUser } = useAuth();
  const nav = useNavigate();
  const [e, setE] = useState(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  // Always point at the latest render's closures, so the listeners below can
  // be subscribed exactly once.
  const activeRef = useRef(false);
  const popupRef = useRef(null);
  const drainRef = useRef(() => {});
  const wakeRef = useRef(() => {});

  useEffect(() => {
    // One line describing the environment, so a pasted console block is enough
    // to tell a missing client ID, a blocked popup, and a lost token apart.
    console.info('[google] ready', {
      origin: window.location.origin,
      mode: isMobile() ? 'redirect' : 'popup',
      clientId: clientId ? 'set' : 'MISSING',
      parked: !!localStorage.getItem('ss_gt'),
      hash: window.location.hash || '(none)',
    });
    const onMsg = (ev) => {
      if (ev.origin === window.location.origin && ev.data?.type === PING) drainRef.current();
    };
    const onWake = () => { if (!document.hidden) wakeRef.current(); };
    window.addEventListener('message', onMsg);
    window.addEventListener('focus', onWake);
    document.addEventListener('visibilitychange', onWake);
    drainRef.current(); // a tab opened mid-flow finishes the flow here
    return () => {
      window.removeEventListener('message', onMsg);
      window.removeEventListener('focus', onWake);
      document.removeEventListener('visibilitychange', onWake);
    };
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  if (!clientId) return null;

  const closePopup = () => {
    const p = popupRef.current;
    popupRef.current = null;
    if (p && !p.closed) { try { p.close(); } catch { /* already gone */ } }
  };

  const exchange = async (idToken, dest) => {
    try {
      console.info('[google] exchanging id_token…');
      const d = await api.post('/api/v1/auth/google', { id_token: idToken });
      console.info('[google] exchange OK', { user: d?.user?.user_id, dest: dest || next || '/' });
      setTokens(d.access_token, d.refresh_token);
      setUser(d.user);
      nav(dest || next || '/');
    } catch (err) {
      // 422 = Google client ID missing server-side, 401 = token rejected.
      console.error('[google] exchange FAILED', { status: err?.status, code: err?.code, message: err?.message });
      setE(err);
    } finally { setBusy(false); }
  };

  const stop = (msg) => {
    clearTimeout(timer.current);
    activeRef.current = false;
    closePopup();
    if (msg) setE({ message: msg });
    setBusy(false);
  };

  // Apply the result the returning OAuth tab parked. takePending() removed it
  // already, so several listeners racing here can still only exchange once.
  const complete = (payload) => {
    if (!payload?.id_token) {
      stop(payload?.error_description
        || (payload?.error ? `Google sign-in failed (${payload.error}).` : 'Google sign-in was cancelled.'));
      return;
    }
    clearTimeout(timer.current);
    activeRef.current = false;
    closePopup();
    exchange(payload.id_token, payload.next);
  };

  // Only speaks when a sign-in is actually in flight or a result was found.
  // A plain page load has nothing pending, and announcing that reads like a
  // failure — "drain {found:false}" is what every idle login page logs.
  drainRef.current = () => {
    const p = takePending();
    if (p || activeRef.current) {
      console.info('[google] drain', { found: Boolean(p), active: activeRef.current });
    }
    if (p) complete(p);
  };

  // Runs when this tab regains the foreground — e.g. the popup was closed.
  wakeRef.current = () => {
    drainRef.current();
    const p = popupRef.current;
    if (!activeRef.current || !p || !p.closed) return;
    if (!localStorage.getItem('ss_at')) { stop('Google sign-in was cancelled.'); return; }
    // Tokens exist, yet nothing was parked for us: another tab probably
    // already exchanged it. Confirm before calling a completed sign-in a
    // cancellation.
    activeRef.current = false;
    clearTimeout(timer.current);
    api.get('/api/v1/me')
      .then((u) => { setUser(u); nav(next || '/'); })
      .catch(() => stop('Google sign-in was cancelled.'));
  };

  const start = () => {
    if (busy) return;
    setE(null);
    setBusy(true);
    clearTimeout(timer.current);
    activeRef.current = true;

    // Build the URL on its own first: a throw here is a different fault than a
    // failed window.open, and one catch around both hides which one happened.
    let url;
    try {
      const nonce = makeNonce();
      const q = new URLSearchParams({
        client_id: clientId,
        redirect_uri: window.location.origin,
        response_type: 'id_token',
        scope: 'openid email profile',
        nonce,
        state: next || '',
        prompt: 'select_account',
      });
      url = `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
    } catch (err) {
      console.error('[google] building the OAuth URL threw', err);
      stop(`Could not build the Google sign-in link: ${err?.message || err}`);
      return;
    }

    const blocked = () => stop(
      'Your browser blocked the Google sign-in window. Allow pop-ups for this site, then try again.',
    );
    const couldNotOpen = (err) => {
      console.error('[google] opening the Google window threw', err);
      stop(`Could not open the Google sign-in window: ${err?.message || err}`);
    };

    // Mobile: navigate this tab to Google rather than open a popup. Mobile
    // browsers treat window.open as a new tab (iOS has no popup windows), and
    // "Block Pop-ups" can refuse it outright, leaving nowhere to go. A plain
    // navigation cannot be blocked and needs no gesture trickery. Google then
    // returns to this same document with no opener, which is googleReturn.js's
    // no-opener path: park the token, load /login, drain it there.
    if (isMobile()) {
      // Mark the round trip so consumeReturn() knows this tab *is* the
      // initiator: it must not act on window.opener, or it would ping a
      // stranger and close the user's own tab.
      try { sessionStorage.setItem(REDIRECT_FLOW_KEY, '1'); } catch { /* ignore */ }
      try { window.location.assign(url); } catch (err) { couldNotOpen(err); }
      return;
    }

    // Desktop: prime a placeholder inside the gesture so OAuth can still be
    // opened 3s later — browsers never popup-block a location assignment on a
    // window that is already open, but they will block a fresh window.open().
    try {
      popupRef.current = window.open('about:blank', 'SplitShareGoogle', 'width=520,height=640');
    } catch { popupRef.current = null; }

    const fallback = () => {
      if (!activeRef.current) return;
      const p = popupRef.current;
      if (!p || p.closed) { blocked(); return; }
      try { p.location.replace(url); } catch (err) { couldNotOpen(err); }
    };

    const p = popupRef.current;
    if (p) {
      // Same-origin placeholder so the window reads as intentional rather than
      // as a stray blank page during the One Tap wait.
      try {
        p.document.write(
          '<!doctype html><meta charset="utf-8"><title>SplitShare</title>'
          + '<body style="margin:0;display:grid;place-items:center;height:100vh;'
          + 'font:500 15px/1.4 system-ui,-apple-system,sans-serif;color:#3d4a44;'
          + 'background:linear-gradient(180deg,#fff,#f7faf8)">Continue in this window…</body>',
        );
        p.document.close();
      } catch { /* harmless if the browser raced us */ }
    }

    // Desktop fast path: One Tap where ITP permits it, OAuth otherwise.
    try {
      // eslint-disable-next-line no-undef
      google.accounts.id.initialize({
        client_id: clientId,
        callback: (resp) => {
          if (resp?.credential) complete({ id_token: resp.credential });
          else fallback();
        },
      });
      // eslint-disable-next-line no-undef
      google.accounts.id.prompt();
    } catch { fallback(); }

    // This GIS build exposes no dismissal signal, so "no answer" is the only
    // failure cue available. One Tap replies immediately or not at all.
    timer.current = setTimeout(fallback, 3000);
  };

  const label = intent === 'signup' ? 'Sign up with Google' : 'Sign in with Google';

  return (
    <div className="auth-sso">
      <div className="auth-sep"><span>or</span></div>
      <Button
        className="auth-google"
        fullWidth
        type="button"
        onClick={start}
        loading={busy}
        leftSection={!busy ? <GoogleGIcon /> : undefined}
        aria-label={label}
      >
        {label}
      </Button>
      <Err e={e} />
    </div>
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
