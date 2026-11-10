// Emailed per-address invitation (splitshare://invite/<token>) — web parity with
// pages/InvitationPage.jsx. Pushed steps of the same screen:
//   (no step)        choice: Continue with Google | Register new account
//   step 'register'  shared RegisterForm, email fixed (code or password) → account, then join
//   step 'login'     shared LoginForm for an existing account (small link on the choice screen)
// Signed in → POST /invitations/:token/join and open the group.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { api, setTokens } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useT } from '../i18n';
import { colors, type } from '../theme';
import { Button, Screen, toast } from '../ui';
import { AuthLayout, AccountErr, a } from '../components/account/AccountKit';
import { InvitationBanner } from '../components/account/InvitationBanner';
import { GoogleSignInButton, LoginForm, RegisterForm } from './AuthScreen';

const LINK_ERRORS = {
  INVITE_INVALID: 'invitation.invalid',
  INVITE_EXPIRED: 'invitation.expired',
  INVITE_USED: 'invitation.used',
};

export default function InvitationScreen({ route, navigation }) {
  const { token, step, info: passedInfo } = route.params || {};
  const t = useT();
  const { user, signIn, setPostAuthRoute } = useAuth();
  const [info, setInfo] = useState(passedInfo || null);
  const [e, setE] = useState(null);
  const accepted = useRef(false); // Google path joins itself before signing in
  const path = `/api/v1/invitations/${encodeURIComponent(token || '')}`;

  useEffect(() => {
    let live = true;
    setE(null);
    if (user) {
      if (accepted.current) return undefined;
      api.post(`${path}/join`)
        .then((r) => { if (live) navigation.replace('GroupDetail', { id: r.group_id }); })
        .catch((err) => { if (live) setE(err); });
    } else if (!info) {
      api.get(path)
        .then((r) => { if (live) setInfo(r); })
        .catch((err) => { if (live) setE(err); });
    }
    return () => { live = false; };
  }, [user, path]); // eslint-disable-line react-hooks/exhaustive-deps

  const goStep = (next, extra = {}) => navigation.push('Invitation', { token, step: next, info: { ...info, ...extra } });

  // Sign-in swaps the auth stack for the app stack (this screen unmounts); come back to
  // the invitation there, which then joins through the link. Shared by login + register.
  const returnHere = () => setPostAuthRoute({ name: 'Invitation', params: { token } });
  const clearReturn = () => setPostAuthRoute(null);
  // The address already has an account: continue on the invite's login step.
  const toLogin = () => navigation.replace('Invitation', { token, step: 'login', info: { ...info, account_exists: true } });

  // Google: sign in, join through the link while still on this screen, then open the group.
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

  const back = (
    <Text style={[a.linkT, { marginTop: 8 }]} onPress={() => navigation.goBack()} accessibilityRole="link">
      ← {t('invitation.otherOptions')}
    </Text>
  );

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
  } else if (step === 'register' && !info.account_exists) {
    body = (
      <>
        {back}
        <Text style={[type.h2, { marginTop: 10 }]} accessibilityRole="header">{t('invitation.registerTitle')}</Text>
        <Text style={[type.small, { marginTop: 4 }]}>{t('invitation.createHint')}</Text>
        <RegisterForm
          initialEmail={info.email}
          lockEmail
          submitLabel={t('invitation.accept')}
          beforeSignIn={returnHere}
          onFail={clearReturn}
          onEmailTaken={toLogin}
        />
      </>
    );
  } else if (step === 'login' || step === 'register') {
    body = (
      <>
        {back}
        <Text style={[type.h2, { marginTop: 10 }]} accessibilityRole="header">{t('auth.logIn')}</Text>
        <Text style={[type.small, { marginTop: 4 }]}>
          {info.account_exists ? t('invitation.accountExists', { email: info.email }) : t('invitation.loginHint')}
        </Text>
        <LoginForm
          initialEmail={info.email}
          submitLabel={t('invitation.loginAction')}
          beforeSignIn={returnHere}
          onFail={clearReturn}
        />
        <View style={a.links}>
          <Text style={a.linkT} onPress={() => navigation.navigate('Forgot')} accessibilityRole="link">{t('auth.forgotPassword')}</Text>
        </View>
      </>
    );
  } else {
    // Choice screen: the two ways in.
    body = (
      <>
        <Text style={[type.h2, { marginTop: 18 }]} accessibilityRole="header">{t('invitation.chooseHow')}</Text>
        <GoogleSignInButton
          navigation={navigation}
          intent="signup"
          loginHint={info.email}
          label={t('auth.continueGoogle')}
          onIdToken={withGoogle}
        />
        <View style={a.orRow} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={a.orLine} /><Text style={a.orT}>{t('auth.or')}</Text><View style={a.orLine} />
        </View>
        {info.account_exists ? (
          <>
            <Text style={[type.small, { marginTop: 12 }]}>{t('invitation.accountExists', { email: info.email })}</Text>
            <Button style={{ marginTop: 12 }} title={t('invitation.loginAction')} onPress={() => goStep('login')} />
          </>
        ) : (
          <>
            <Button style={{ marginTop: 12 }} icon="＋" title={t('invitation.register')} onPress={() => goStep('register')} />
            <View style={a.links}>
              <Text style={type.small}>{t('invitation.haveAccount')}</Text>
              <Text style={a.linkT} onPress={() => goStep('login')} accessibilityRole="link">{t('auth.logIn')}</Text>
            </View>
          </>
        )}
      </>
    );
  }

  return (
    <AuthLayout compact title={info && !linkError ? undefined : t('invitation.heading')}>
      {info && !linkError ? (
        <InvitationBanner inviter={info.invited_by} group={info.group_name} memberCount={info.member_count} email={info.email} />
      ) : null}
      {body}
    </AuthLayout>
  );
}
