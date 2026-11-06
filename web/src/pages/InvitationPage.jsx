import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Anchor, Button, Center, Loader, PasswordInput, Stack, Text, TextInput, Title,
} from '@mantine/core';
import { api, setTokens } from '../api.js';
import { Err, useAuth } from '../auth.jsx';
import { AuthLayout, AuthSubmit, GoogleBtn } from './AuthPages.jsx';
import { useT } from '../prefs.jsx';

// Link errors that end the flow: show a friendly message + a way forward.
const LINK_ERRORS = {
  INVITE_INVALID: 'invitation.invalid',
  INVITE_EXPIRED: 'invitation.expired',
  INVITE_USED: 'invitation.used',
};

// Emailed per-address invitation (/invite/:token). Signed in → join through the
// link. Anonymous → preview, then create the account: Gmail addresses continue
// with Google (defaults come from Google), others just choose a password.
export function InvitationPage() {
  const t = useT();
  const { token } = useParams();
  const nav = useNavigate();
  const { user, loading, setUser } = useAuth();
  const [info, setInfo] = useState(null);
  const [e, setE] = useState(null);
  const [usePassword, setUsePassword] = useState(false);
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const accepted = useRef(false);
  const next = `/invite/${encodeURIComponent(token)}`;
  const path = `/api/v1/invitations/${encodeURIComponent(token)}`;
  const googleReady = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);

  useEffect(() => {
    if (loading) return undefined;
    let live = true;
    setE(null);
    if (user) {
      // Signed in (returning from Google or login): join through the link.
      if (accepted.current) return undefined;
      api.post(`${path}/join`)
        .then((r) => { if (live) nav(`/groups/${r.group_id}`, { replace: true }); })
        .catch((err) => { if (live) setE(err); });
    } else {
      api.get(path)
        .then((r) => { if (live) setInfo(r); })
        .catch((err) => { if (live) setE(err); });
    }
    return () => { live = false; };
  }, [loading, user, path, nav]);

  const accept = async (ev) => {
    ev.preventDefault();
    if (busy) return;
    setBusy(true);
    setE(null);
    try {
      const d = await api.post(`${path}/accept`, { password: pw });
      accepted.current = true;
      setTokens(d.access_token, d.refresh_token);
      setUser(d.user);
      nav(`/groups/${d.group_id}`, { replace: true });
    } catch (err) { setE(err); } finally { setBusy(false); }
  };

  const linkError = e && LINK_ERRORS[e.code];
  const exists = info?.account_exists || e?.code === 'ACCOUNT_EXISTS';
  const google = info?.is_gmail && googleReady && !usePassword;

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
  } else if (exists) {
    body = (
      <>
        <Text size="sm">{t('invitation.accountExists', { email: info.email })}</Text>
        <Button component={Link} to={`/login?next=${encodeURIComponent(next)}`} className="wizard-primary auth-submit" fullWidth>
          {t('invitation.logInToJoin')}
        </Button>
        {info.is_gmail && googleReady && <GoogleBtn next={next} intent="signin" loginHint={info.email} />}
      </>
    );
  } else {
    body = (
      <>
        <TextInput label={t('invitation.yourEmail')} value={info.email} readOnly />
        {google ? (
          <>
            <Text size="sm" c="dimmed">{t('invitation.gmailHint')}</Text>
            <GoogleBtn next={next} intent="signup" loginHint={info.email} />
            <Anchor component="button" type="button" size="sm" ta="center" onClick={() => setUsePassword(true)}>
              {t('invitation.usePassword')}
            </Anchor>
          </>
        ) : (
          <form onSubmit={accept}>
            <Stack gap="sm">
              <PasswordInput
                label={t('invitation.choosePassword')}
                description={t('invitation.passwordHint')}
                required
                autoFocus
                autoComplete="new-password"
                value={pw}
                onChange={(x) => setPw(x.target.value)}
              />
              <AuthSubmit loading={busy} icon="plus">{t('invitation.accept')}</AuthSubmit>
              {info.is_gmail && googleReady && (
                <Anchor component="button" type="button" size="sm" ta="center" onClick={() => setUsePassword(false)}>
                  {t('invitation.useGoogle')}
                </Anchor>
              )}
            </Stack>
          </form>
        )}
        <Err e={e} />
      </>
    );
  }

  return (
    <AuthLayout>
      <Stack gap="md">
        <div className="auth-heading">
          <Title order={3} className="auth-title">
            {info ? t('invitation.title', { name: info.group_name }) : t('invitation.heading')}
          </Title>
          {info && (
            <Text size="sm" c="dimmed" className="auth-desc">
              {t('invitation.invitedBy', { name: info.invited_by })} · {t('invitation.members', { count: info.member_count })}
            </Text>
          )}
        </div>
        {body}
      </Stack>
    </AuthLayout>
  );
}
