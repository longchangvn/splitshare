// Emailed per-address invitation (splitshare://invite/<token>) — web parity with
// pages/InvitationPage.jsx. Signed in → POST /invitations/:token/join. Anonymous →
// GET preview, then create the account: Gmail continues with native Google (defaults
// from Google), others choose a password (POST /invitations/:token/accept).
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { api, setTokens } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { nativeGoogleAvailable } from '../auth/google';
import { useT } from '../i18n';
import { colors, type } from '../theme';
import { Button, Field, Input, Screen, toast } from '../ui';
import { AuthLayout, AccountErr, PasswordInput, a } from '../components/account/AccountKit';
import { GoogleSignInButton, validPassword } from './AuthScreen';

const LINK_ERRORS = {
  INVITE_INVALID: 'invitation.invalid',
  INVITE_EXPIRED: 'invitation.expired',
  INVITE_USED: 'invitation.used',
};

export default function InvitationScreen({ route, navigation }) {
  const { token } = route.params || {};
  const t = useT();
  const { user, signIn, setPostAuthRoute } = useAuth();
  const [info, setInfo] = useState(null);
  const [e, setE] = useState(null);
  const [usePassword, setUsePassword] = useState(false);
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const accepted = useRef(false);
  const path = `/api/v1/invitations/${encodeURIComponent(token || '')}`;
  const googleReady = nativeGoogleAvailable();

  useEffect(() => {
    let live = true;
    setE(null);
    if (user) {
      if (accepted.current) return undefined;
      api.post(`${path}/join`)
        .then((r) => { if (live) navigation.replace('GroupDetail', { id: r.group_id }); })
        .catch((err) => { if (live) setE(err); });
    } else {
      api.get(path)
        .then((r) => { if (live) setInfo(r); })
        .catch((err) => { if (live) setE(err); });
    }
    return () => { live = false; };
  }, [user, path]); // eslint-disable-line react-hooks/exhaustive-deps

  const accept = async () => {
    if (busy) return;
    setE(null);
    if (!validPassword(pw)) return setE({ friendly: true, message: t('invitation.passwordHint') });
    setBusy(true);
    try {
      const d = await api.post(`${path}/accept`, { password: pw });
      accepted.current = true;
      await signIn(d, { name: 'GroupDetail', params: { id: d.group_id } });
    } catch (err) { setE(err); setBusy(false); }
    return undefined;
  };

  // Google: sign in, join through the link while still on this screen (the auth
  // stack unmounts on sign-in), then open the group.
  const withGoogle = async (idToken) => {
    const d = await api.post('/api/v1/auth/google', { id_token: idToken });
    await setTokens(d.access_token, d.refresh_token);
    let next = null;
    try {
      const j = await api.post(`${path}/join`);
      next = { name: 'GroupDetail', params: { id: j.group_id } };
    } catch (err) {
      toast({ title: t(LINK_ERRORS[err.code] || 'errors.joinFailed'), message: err.message, color: 'red' });
    }
    accepted.current = true;
    await signIn(d, next);
  };

  const goLogin = () => {
    setPostAuthRoute({ name: 'Invitation', params: { token } });
    navigation.navigate('Login');
  };

  const linkError = e && LINK_ERRORS[e.code];

  if (user) {
    return (
      <Screen>
        <View style={{ alignItems: 'center', paddingVertical: 32, gap: 12 }} accessibilityLiveRegion="polite">
          {linkError ? (
            <>
              <Text style={[type.body, { textAlign: 'center' }]}>{t(linkError)}</Text>
              <Button title={t('invitation.goHome')} onPress={() => navigation.navigate('Main')} />
            </>
          ) : e ? (
            <AccountErr e={e} />
          ) : (
            <>
              <ActivityIndicator color={colors.primary} />
              <Text style={type.body}>{t('invitation.joining')}</Text>
            </>
          )}
        </View>
      </Screen>
    );
  }

  const exists = info?.account_exists || e?.code === 'ACCOUNT_EXISTS';
  const google = info?.is_gmail && googleReady && !usePassword;
  let body;
  if (linkError) {
    body = (
      <>
        <Text style={[type.body, { marginTop: 14 }]} accessibilityRole="alert">{t(linkError)}</Text>
        <Button style={{ marginTop: 16 }} title={t('auth.logIn')} onPress={() => navigation.navigate('Login')} />
      </>
    );
  } else if (!info) {
    body = e ? <AccountErr e={e} /> : (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 }}>
        <ActivityIndicator color={colors.primary} />
        <Text style={type.body}>{t('invitation.loading')}</Text>
      </View>
    );
  } else if (exists) {
    body = (
      <>
        <Text style={[type.body, { marginTop: 14 }]}>{t('invitation.accountExists', { email: info.email })}</Text>
        <Button style={{ marginTop: 16 }} title={t('invitation.logInToJoin')} onPress={goLogin} />
        {info.is_gmail && googleReady ? (
          <GoogleSignInButton navigation={navigation} intent="signin" loginHint={info.email} onIdToken={withGoogle} />
        ) : null}
      </>
    );
  } else {
    body = (
      <>
        <Field label={t('invitation.yourEmail')}>
          <Input value={info.email} editable={false} accessibilityLabel={t('invitation.yourEmail')} />
        </Field>
        {google ? (
          <>
            <Text style={[type.small, { marginTop: 12 }]}>{t('invitation.gmailHint')}</Text>
            <GoogleSignInButton navigation={navigation} intent="signup" loginHint={info.email} onIdToken={withGoogle} />
            <View style={a.links}>
              <Text style={a.linkT} onPress={() => setUsePassword(true)} accessibilityRole="link">{t('invitation.usePassword')}</Text>
            </View>
          </>
        ) : (
          <>
            <Field label={t('invitation.choosePassword')} hint={t('invitation.passwordHint')}>
              <PasswordInput value={pw} onChangeText={setPw} autoComplete="new-password" returnKeyType="go" onSubmitEditing={accept} />
            </Field>
            <AccountErr e={e} />
            <Button style={{ marginTop: 16 }} icon="＋" title={t('invitation.accept')} busy={busy} disabled={!pw} onPress={accept} />
            {info.is_gmail && googleReady ? (
              <View style={a.links}>
                <Text style={a.linkT} onPress={() => setUsePassword(false)} accessibilityRole="link">{t('invitation.useGoogle')}</Text>
              </View>
            ) : null}
          </>
        )}
      </>
    );
  }

  return (
    <AuthLayout
      compact
      title={info ? t('invitation.title', { name: info.group_name }) : t('invitation.heading')}
      desc={info ? `${t('invitation.invitedBy', { name: info.invited_by })} · ${t('invitation.members', { count: info.member_count })}` : undefined}
    >
      {body}
    </AuthLayout>
  );
}
