import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Anchor, Button, PasswordInput, PinInput, SegmentedControl, Stack, Text, TextInput, Title,
} from '@mantine/core';
import { useAuth, Err } from '../auth.jsx';
import { api, setTokens } from '../api.js';
import { takePending, PING, makeNonce, REDIRECT_FLOW_KEY } from '../googleReturn.js';
import { BrandMark } from '../components/Shell.jsx';
import { InvitationBanner } from '../components/InvitationBanner.jsx';
import { useT } from '../prefs.jsx';

// Sanitized in-app destination from ?next= (same-origin path only).
const safeNext = (search) => {
  const n = new URLSearchParams(search).get('next');
  return n && n.startsWith('/') && !n.startsWith('//') ? n : null;
};
const withNext = (path, next) => (next ? `${path}?next=${encodeURIComponent(next)}` : path);

function AuthBrand() {
  const t = useT();
  return (
    <Link to="/login" className="brand-logo is-light auth-brand" aria-label={t('shell.brand')}>
      <BrandMark size={28} />
      <span className="brand-word">{t('shell.brand')}</span>
    </Link>
  );
}

export function AuthLayout({ children }) {
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

export function AuthSubmit({ children, loading, icon = 'enter', ...props }) {
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (v) => EMAIL_RE.test(v.trim());

/** Email field + Continue. Calls onContinue(normalizedEmail) when the format is valid. */
function EmailStep({ initial = '', submitLabel, onContinue, busy, autoFocus = true }) {
  const t = useT();
  const [email, setEmail] = useState(initial);
  const [err, setErr] = useState(null);
  const go = (ev) => {
    ev.preventDefault();
    const v = email.trim().toLowerCase();
    if (!isEmail(v)) { setErr(t('auth.emailInvalid')); return; }
    setErr(null);
    onContinue(v);
  };
  return (
    <form onSubmit={go} noValidate>
      <Stack gap="sm">
        <TextInput
          label={t('auth.email')}
          placeholder={t('auth.emailPlaceholder')}
          type="email"
          inputMode="email"
          required
          autoFocus={autoFocus}
          autoComplete="email"
          name="email"
          value={email}
          error={err}
          onChange={(x) => setEmail(x.target.value)}
        />
        <AuthSubmit loading={busy} icon="mail">{submitLabel || t('auth.continue')}</AuthSubmit>
      </Stack>
    </form>
  );
}

/** The chosen email, with a "Change" link when onChange is given. */
function EmailChip({ email, onChange }) {
  const t = useT();
  return (
    <Text size="sm" className="auth-email-chip">
      <b>{email}</b>{' '}
      {onChange && <Anchor component="button" type="button" size="sm" onClick={onChange}>{t('auth.changeEmail')}</Anchor>}
    </Text>
  );
}

/**
 * 6-digit code entry for an email that was just sent a code. Verifies on the
 * 6th digit or on submit; Resend re-requests after the server cooldown.
 */
export function OtpStep({ email, onBack, onSignedIn, resendAfter = 60 }) {
  const t = useT();
  const { requestOtp, verifyOtp } = useAuth();
  const [code, setCode] = useState('');
  const [e, setE] = useState(null);
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(resendAfter);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (left <= 0) return undefined;
    const id = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [left]);

  const verify = async (value = code) => {
    if (busy || value.length !== 6) return;
    setBusy(true);
    setE(null);
    try { onSignedIn(await verifyOtp(email, value)); } catch (err) { setE(err); setCode(''); } finally { setBusy(false); }
  };
  const resend = async () => {
    setE(null);
    try {
      const r = await requestOtp(email);
      setLeft(r?.resend_after_seconds ?? resendAfter);
      setResent(true);
    } catch (err) { setE(err); }
  };

  return (
    <form onSubmit={(ev) => { ev.preventDefault(); verify(); }}>
      <Stack gap="sm">
        <Text size="sm" aria-live="polite">{t('auth.codeSentTo', { email })}</Text>
        {onBack && <EmailChip email={email} onChange={onBack} />}
        <PinInput
          length={6}
          type="number"
          oneTimeCode
          autoFocus
          size="md"
          value={code}
          onChange={setCode}
          onComplete={verify}
          disabled={busy}
          aria-label={t('auth.code')}
          className="auth-pin"
        />
        <AuthSubmit loading={busy} icon="lock" disabled={code.length !== 6}>{t('auth.verifyCode')}</AuthSubmit>
        <Text ta="center" size="sm">
          {left > 0
            ? <Text span c="dimmed" size="sm">{t('auth.resendIn', { seconds: left })}</Text>
            : <Anchor component="button" type="button" size="sm" onClick={resend}>{t('auth.resendCode')}</Anchor>}
        </Text>
        {resent && left > 0 && <Text size="xs" c="dimmed" ta="center">{t('auth.codeResent')}</Text>}
        <Err e={e} />
      </Stack>
    </form>
  );
}

/** Sends the first code, then hands over to OtpStep. Returns [send, sending, error]. */
function useSendCode(onSent) {
  const { requestOtp } = useAuth();
  const [busy, setBusy] = useState(false);
  const [e, setE] = useState(null);
  const send = async (email) => {
    if (busy) return;
    setBusy(true);
    setE(null);
    try {
      const r = await requestOtp(email);
      onSent(email, r?.resend_after_seconds ?? 60);
    } catch (err) {
      // A code sent moments ago is still valid: go straight to entering it.
      if (err?.code === 'OTP_COOLDOWN') onSent(email, 60); else setE(err);
    } finally { setBusy(false); }
  };
  return [send, busy, e];
}

/**
 * The one login form: Password (email + password) or Email code.
 * Shared by /login and the invitation login step. onSignedIn runs after the
 * session is stored (useAuth().user is already set).
 */
export function LoginForm({ initialEmail = '', onSignedIn, submitLabel }) {
  const t = useT();
  const { login } = useAuth();
  const [method, setMethod] = useState('password');
  const [id, setId] = useState(initialEmail);
  const [pw, setPw] = useState('');
  const [codeFor, setCodeFor] = useState(null);
  const [e, setE] = useState(null);
  const [busy, setBusy] = useState(false);
  const [send, sending, sendErr] = useSendCode((email, wait) => setCodeFor({ email, wait }));

  const signIn = async (ev) => {
    ev.preventDefault();
    if (busy) return;
    setBusy(true);
    setE(null);
    try { onSignedIn(await login(id.trim(), pw)); } catch (err) { setE(err); } finally { setBusy(false); }
  };

  return (
    <Stack gap="sm">
      <SegmentedControl
        fullWidth
        value={method}
        onChange={(m) => { setMethod(m); setE(null); setCodeFor(null); }}
        data={[
          { value: 'password', label: t('auth.methodPassword') },
          { value: 'code', label: t('auth.methodCode') },
        ]}
        aria-label={t('auth.chooseMethod')}
      />
      {method === 'password' ? (
        <form onSubmit={signIn}>
          <Stack gap="sm">
            <TextInput
              label={t('auth.email')}
              placeholder={t('auth.emailPlaceholder')}
              required
              autoFocus={!initialEmail}
              autoComplete="username"
              name="username"
              value={id}
              onChange={(x) => setId(x.target.value)}
            />
            <PasswordInput
              label={t('auth.password')}
              required
              autoFocus={Boolean(initialEmail)}
              autoComplete="current-password"
              name="password"
              value={pw}
              onChange={(x) => setPw(x.target.value)}
              onKeyDown={(ev) => { if (ev.key === 'Enter' && !busy) ev.currentTarget.form?.requestSubmit(); }}
            />
            <AuthSubmit loading={busy}>{submitLabel || t('auth.logIn')}</AuthSubmit>
          </Stack>
        </form>
      ) : codeFor ? (
        <OtpStep
          key={codeFor.email}
          email={codeFor.email}
          resendAfter={codeFor.wait}
          onBack={() => setCodeFor(null)}
          onSignedIn={onSignedIn}
        />
      ) : (
        <EmailStep
          initial={isEmail(id) ? id.trim() : initialEmail}
          submitLabel={t('auth.sendCode')}
          busy={sending}
          onContinue={(email) => { setId(email); send(email); }}
        />
      )}
      <Err e={e || (method === 'code' && !codeFor ? sendErr : null)} />
    </Stack>
  );
}

export function Login() {
  const t = useT();
  const nav = useNavigate();
  const location = useLocation();
  const next = safeNext(location.search);
  const invitation = location.state?.invitation;
  return (
    <AuthLayout>
      <Stack gap="md">
        {invitation && <InvitationBanner {...invitation} />}
        <div className="auth-heading">
          <Title order={3} className="auth-title">{t('auth.welcomeBack')}</Title>
          <Text size="sm" c="dimmed" className="auth-desc">{t('auth.loginContinue')}</Text>
        </div>
        <LoginForm onSignedIn={() => nav(next || '/')} />
        <GoogleBtn next={next} intent="signin" />
        <Text ta="center" size="sm" className="auth-links">
          <Anchor component={Link} to={withNext('/register', next)} state={location.state}>{t('auth.register')}</Anchor>
          <span aria-hidden>·</span>
          <Anchor component={Link} to="/forgot">{t('auth.forgotPassword')}</Anchor>
        </Text>
      </Stack>
    </AuthLayout>
  );
}

/**
 * The one registration form (used by /register and the invitation register step):
 * email → choose "Email me a code" | "Use a password" → code / password.
 * The email becomes the username; the display name is set later in Profile.
 * lockEmail skips the email step (invited address). onEmailTaken, when given,
 * handles an address that already has an account (otherwise the error shows).
 */
export function RegisterForm({ initialEmail = '', lockEmail = false, submitLabel, onSignedIn, onEmailTaken }) {
  const t = useT();
  const { register } = useAuth();
  const [step, setStep] = useState(lockEmail ? 'method' : 'email'); // email | method | code | password
  const [email, setEmail] = useState(initialEmail.trim().toLowerCase());
  const [wait, setWait] = useState(60);
  const [pw, setPw] = useState('');
  const [e, setE] = useState(null);
  const [busy, setBusy] = useState(false);
  const [send, sending, sendErr] = useSendCode((_, w) => { setWait(w); setStep('code'); });
  const toEmail = lockEmail ? null : () => { setStep('email'); setE(null); setPw(''); };
  const toMethod = () => { setStep('method'); setE(null); setPw(''); };

  const create = async (ev) => {
    ev.preventDefault();
    if (busy) return;
    setBusy(true);
    setE(null);
    try { onSignedIn(await register(email, pw)); } catch (err) {
      if (err?.code === 'EMAIL_TAKEN' && onEmailTaken) onEmailTaken(); else setE(err);
    } finally { setBusy(false); }
  };

  let body;
  if (step === 'email') {
    body = (
      <>
        <EmailStep initial={email} onContinue={(v) => { setEmail(v); setStep('method'); }} />
        <Text size="xs" c="dimmed">{t('auth.displayNameLater')}</Text>
      </>
    );
  } else if (step === 'method') {
    body = (
      <Stack gap="sm">
        <EmailChip email={email} onChange={toEmail} />
        <Text size="sm" c="dimmed">{t('auth.chooseMethod')}</Text>
        <AuthSubmit type="button" icon="mail" loading={sending} onClick={() => send(email)}>
          {t('auth.useCode')}
        </AuthSubmit>
        <Button className="auth-google" fullWidth type="button" leftSection={<AuthActionIcon name="lock" />}
          onClick={() => setStep('password')} disabled={sending}>
          {t('auth.usePassword')}
        </Button>
        <Err e={sendErr} />
      </Stack>
    );
  } else if (step === 'code') {
    body = <OtpStep email={email} resendAfter={wait} onBack={toEmail || toMethod} onSignedIn={onSignedIn} />;
  } else {
    body = (
      <form onSubmit={create}>
        <Stack gap="sm">
          <EmailChip email={email} onChange={toEmail || toMethod} />
          {/* Hidden username field lets password managers save the pair. */}
          <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
          <PasswordInput
            label={t('auth.password')}
            description={t('auth.passwordRule')}
            required
            autoFocus
            autoComplete="new-password"
            value={pw}
            onChange={(x) => setPw(x.target.value)}
          />
          <AuthSubmit loading={busy} icon="plus">{submitLabel || t('auth.createAccount')}</AuthSubmit>
          <Err e={e} />
        </Stack>
      </form>
    );
  }
  return body;
}

export function Register() {
  const t = useT();
  const nav = useNavigate();
  const location = useLocation();
  const next = safeNext(location.search);
  const invitation = location.state?.invitation;
  return (
    <AuthLayout>
      <Stack gap="md">
        {invitation && <InvitationBanner {...invitation} />}
        <div className="auth-heading">
          <Title order={3} className="auth-title">{t('auth.createAccount')}</Title>
          <Text size="sm" c="dimmed" className="auth-desc">{t('auth.startSplitting')}</Text>
        </div>
        <RegisterForm onSignedIn={() => nav(next || '/')} />
        <GoogleBtn next={next} intent="signup" />
        <Text ta="center" size="sm" className="auth-links">
          <Anchor component={Link} to={withNext('/login', next)} state={location.state}>{t('auth.backToLogin')}</Anchor>
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
export function GoogleBtn({ next, intent = 'signin', loginHint, label: labelOverride, divider = true }) {
  const t = useT();
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
        || (payload?.error ? t('auth.googleFailed', { error: payload.error }) : t('auth.googleCancelled')));
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
    if (!localStorage.getItem('ss_at')) { stop(t('auth.googleCancelled')); return; }
    // Tokens exist, yet nothing was parked for us: another tab probably
    // already exchanged it. Confirm before calling a completed sign-in a
    // cancellation.
    activeRef.current = false;
    clearTimeout(timer.current);
    api.get('/api/v1/me')
      .then((u) => { setUser(u); nav(next || '/'); })
      .catch(() => stop(t('auth.googleCancelled')));
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
        ...(loginHint ? { login_hint: loginHint } : {}),
      });
      url = `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
    } catch (err) {
      console.error('[google] building the OAuth URL threw', err);
      stop(t('auth.googleLinkFailed', { message: err?.message || err }));
      return;
    }

    const blocked = () => stop(t('auth.googlePopupBlocked'));
    const couldNotOpen = (err) => {
      console.error('[google] opening the Google window threw', err);
      stop(t('auth.googleOpenFailed', { message: err?.message || err }));
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
          + `background:linear-gradient(180deg,#fff,#f7faf8)">${t('auth.googleContinueWindow')}</body>`,
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

  const label = labelOverride || t(intent === 'signup' ? 'auth.signUpGoogle' : 'auth.signInGoogle');

  return (
    <div className="auth-sso">
      {divider && <div className="auth-sep"><span>{t('auth.or')}</span></div>}
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
