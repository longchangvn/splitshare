import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Anchor, Button, Center, Loader, Stack, Text, Title,
} from '@mantine/core';
import { api } from '../api.js';
import { Err, useAuth } from '../auth.jsx';
import { AuthLayout, GoogleBtn, LoginForm, RegisterForm } from './AuthPages.jsx';
import { InvitationBanner } from '../components/InvitationBanner.jsx';
import { useT } from '../prefs.jsx';

// Link errors that end the flow: show a friendly message + a way forward.
const LINK_ERRORS = {
  INVITE_INVALID: 'invitation.invalid',
  INVITE_EXPIRED: 'invitation.expired',
  INVITE_USED: 'invitation.used',
};

/**
 * Anonymous landing for the shared group link (/g/:token): invitation banner +
 * Continue with Google | Register new account (+ small Log in link). Each path
 * returns to /g/:token signed in, which then joins the group.
 */
export function GroupLinkInvitation({ token }) {
  const t = useT();
  const [group, setGroup] = useState(null);
  const [e, setE] = useState(null);
  const next = `/g/${token}`;
  const googleReady = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);

  useEffect(() => {
    let live = true;
    api.get(`/api/v1/invites/${encodeURIComponent(token)}`)
      .then((g) => { if (live) setGroup(g); })
      .catch((err) => { if (live) setE(err); });
    return () => { live = false; };
  }, [token]);

  const invitation = group ? { group: group.name, memberCount: group.member_count } : null;
  const to = (path) => ({ pathname: path, search: `?next=${encodeURIComponent(next)}` });

  let body;
  if (e) {
    body = (
      <>
        <Text size="sm" role="alert">{t(e.code === 'INVITE_ROTATED' ? 'invitation.invalid' : 'errors.joinFailed')}</Text>
        <Button component={Link} to="/login" className="wizard-primary auth-submit" fullWidth>{t('auth.logIn')}</Button>
      </>
    );
  } else if (!group) {
    body = (
      <Center py="md" aria-live="polite">
        <Loader size="sm" />
        <Text size="sm" ml="sm">{t('invitation.loading')}</Text>
      </Center>
    );
  } else {
    body = (
      <>
        <div className="auth-heading">
          <Title order={3} className="auth-title">{t('invitation.chooseHow')}</Title>
        </div>
        {googleReady && (
          <>
            <GoogleBtn next={next} intent="signup" label={t('auth.continueGoogle')} divider={false} />
            <div className="auth-sep"><span>{t('auth.or')}</span></div>
          </>
        )}
        <Button component={Link} to={to('/register')} state={{ invitation }} className="wizard-primary auth-submit" fullWidth>
          {t('invitation.register')}
        </Button>
        <Text ta="center" size="sm" className="auth-links">
          {t('invitation.haveAccount')}{' '}
          <Anchor component={Link} to={to('/login')} state={{ invitation }}>{t('auth.logIn')}</Anchor>
        </Text>
      </>
    );
  }

  return (
    <AuthLayout>
      <Stack gap="md">
        {invitation ? <InvitationBanner {...invitation} /> : (
          <div className="auth-heading">
            <Title order={3} className="auth-title">{t('invitation.heading')}</Title>
          </div>
        )}
        {body}
      </Stack>
    </AuthLayout>
  );
}

// Emailed per-address invitation.
//   /invite/:token           → choice: Continue with Google | Register new account
//   /invite/:token/register  → shared RegisterForm, email fixed (code or password) → account, then join
//   /invite/:token/login     → existing account (small link on the choice screen)
// Signed in on any of them (after Google or login) → join through the link.
export function InvitationPage() {
  const t = useT();
  const { token, step } = useParams();
  const nav = useNavigate();
  const { user, loading } = useAuth();
  const [info, setInfo] = useState(null);
  const [e, setE] = useState(null);
  const base = `/invite/${encodeURIComponent(token)}`;
  const path = `/api/v1/invitations/${encodeURIComponent(token)}`;
  const googleReady = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);

  useEffect(() => {
    if (loading) return undefined;
    let live = true;
    setE(null);
    if (user) {
      api.post(`${path}/join`)
        .then((r) => { if (live) nav(`/groups/${r.group_id}`, { replace: true }); })
        .catch((err) => { if (live) setE(err); });
    } else if (!info) {
      api.get(path)
        .then((r) => { if (live) setInfo(r); })
        .catch((err) => { if (live) setE(err); });
    }
    return () => { live = false; };
  }, [loading, user, path, nav, info]);

  useEffect(() => { setE(null); }, [step]);

  // The address already has an account: continue on the invite's login step.
  const toLogin = () => {
    setInfo((i) => ({ ...i, account_exists: true }));
    nav(`${base}/login`, { replace: true });
  };

  const linkError = e && LINK_ERRORS[e.code];
  const back = (
    <Anchor component={Link} to={base} size="sm">← {t('invitation.otherOptions')}</Anchor>
  );

  let body;
  if (linkError) {
    body = (
      <>
        <Text size="sm" role="alert">{t(linkError)}</Text>
        <Button component={Link} to={user ? '/' : '/login'} className="wizard-primary auth-submit" fullWidth>
          {user ? t('invitation.goHome') : t('auth.logIn')}
        </Button>
      </>
    );
  } else if (loading || user || !info) {
    body = e ? <Err e={e} /> : (
      <Center py="md" aria-live="polite">
        <Loader size="sm" />
        <Text size="sm" ml="sm">{user ? t('invitation.joining') : t('invitation.loading')}</Text>
      </Center>
    );
  } else if (step === 'register' && !info.account_exists) {
    body = (
      <>
        {back}
        <div className="auth-heading">
          <Title order={3} className="auth-title">{t('invitation.registerTitle')}</Title>
          <Text size="sm" c="dimmed" className="auth-desc">{t('invitation.createHint')}</Text>
        </div>
        {/* The shared registration form; signing in sets the user and the effect above joins. */}
        <RegisterForm
          initialEmail={info.email}
          lockEmail
          submitLabel={t('invitation.accept')}
          onSignedIn={() => {}}
          onEmailTaken={toLogin}
        />
      </>
    );
  } else if (step === 'login' || step === 'register') {
    body = (
      <>
        {back}
        <div className="auth-heading">
          <Title order={3} className="auth-title">{t('auth.logIn')}</Title>
          <Text size="sm" c="dimmed" className="auth-desc">
            {info.account_exists ? t('invitation.accountExists', { email: info.email }) : t('invitation.loginHint')}
          </Text>
        </div>
        {/* Signing in sets the user; the effect above then joins through the link. */}
        <LoginForm initialEmail={info.email} submitLabel={t('invitation.loginAction')} onSignedIn={() => {}} />
        <Text ta="center" size="sm" className="auth-links">
          <Anchor component={Link} to="/forgot">{t('auth.forgotPassword')}</Anchor>
        </Text>
      </>
    );
  } else {
    // Choice screen: the two ways in.
    body = (
      <>
        <div className="auth-heading">
          <Title order={3} className="auth-title">{t('invitation.chooseHow')}</Title>
        </div>
        {googleReady && (
          <GoogleBtn
            next={base}
            intent="signup"
            loginHint={info.email}
            label={t('auth.continueGoogle')}
            divider={false}
          />
        )}
        {googleReady && <div className="auth-sep"><span>{t('auth.or')}</span></div>}
        {info.account_exists ? (
          <>
            <Text size="sm" c="dimmed">{t('invitation.accountExists', { email: info.email })}</Text>
            <Button component={Link} to={`${base}/login`} className="wizard-primary auth-submit" fullWidth>
              {t('invitation.loginAction')}
            </Button>
          </>
        ) : (
          <Button component={Link} to={`${base}/register`} className="wizard-primary auth-submit" fullWidth>
            {t('invitation.register')}
          </Button>
        )}
        {!info.account_exists && (
          <Text ta="center" size="sm" className="auth-links">
            {t('invitation.haveAccount')}{' '}
            <Anchor component={Link} to={`${base}/login`}>{t('auth.logIn')}</Anchor>
          </Text>
        )}
      </>
    );
  }

  return (
    <AuthLayout>
      <Stack gap="md">
        {info && !user && !linkError ? (
          <InvitationBanner
            inviter={info.invited_by}
            group={info.group_name}
            memberCount={info.member_count}
            email={info.email}
          />
        ) : (
          <div className="auth-heading">
            <Title order={3} className="auth-title">{t('invitation.heading')}</Title>
          </div>
        )}
        {body}
      </Stack>
    </AuthLayout>
  );
}
