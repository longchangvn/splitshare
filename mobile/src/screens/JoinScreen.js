// Shared group link (splitshare://g/<token>) — web parity with ExpenseDetail.jsx JoinPage
// + InvitationPage.jsx GroupLinkInvitation. Signed in → POST /groups/join (idempotent;
// 410 INVITE_ROTATED). Anonymous → invitation banner + Continue with Google |
// Register new account (+ small Log in link); each path comes back here and joins.
import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { api, groupIdOf, setTokens } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useT } from '../i18n';
import { colors, type } from '../theme';
import { Button, toast } from '../ui';
import { AuthLayout, a } from '../components/account/AccountKit';
import { InvitationBanner } from '../components/account/InvitationBanner';
import { GoogleSignInButton } from './AuthScreen';

export default function JoinScreen({ route, navigation }) {
  const { user, signIn, setPostAuthRoute } = useAuth();
  const t = useT();
  const { token } = route.params || {};
  const [msg, setMsg] = useState(null);
  const [group, setGroup] = useState(null);

  useEffect(() => {
    let live = true;
    if (user) {
      (async () => {
        try {
          const g = await api.post('/api/v1/groups/join', { token });
          const gid = groupIdOf(g);
          if (!live) return;
          if (gid) navigation.replace('GroupDetail', { id: gid });
          else setMsg(t('m.join.joinedOpenGroups'));
        } catch (e) {
          if (live) setMsg(e.code === 'INVITE_ROTATED' ? t('m.join.rotated') : t('m.join.failed', { reason: e.message || e.code }));
        }
      })();
    } else {
      api.get(`/api/v1/invites/${encodeURIComponent(token || '')}`)
        .then((g) => { if (live) setGroup(g); })
        .catch((e) => { if (live) setMsg(e.code === 'INVITE_ROTATED' ? t('m.join.rotated') : t('m.join.failed', { reason: e.message || e.code })); });
    }
    return () => { live = false; };
  }, [token, user]); // eslint-disable-line react-hooks/exhaustive-deps

  if (user) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12, backgroundColor: colors.screen }}>
        {msg ? null : <ActivityIndicator color={colors.primary} />}
        <Text style={type.body}>{msg || t('m.join.joining')}</Text>
      </View>
    );
  }

  const invitation = group ? { group: group.name, memberCount: group.member_count } : null;

  // Register / log in swap the auth stack for the app stack; come back here to join.
  const go = (screen) => {
    setPostAuthRoute({ name: 'Join', params: { token } });
    navigation.navigate(screen, { invitation });
  };

  const withGoogle = async (idToken) => {
    const d = await api.post('/api/v1/auth/google', { id_token: idToken });
    await setTokens(d.access_token, d.refresh_token);
    let next = null;
    try {
      const g = await api.post('/api/v1/groups/join', { token });
      next = { name: 'GroupDetail', params: { id: groupIdOf(g) } };
    } catch (e) {
      toast({ title: t('errors.joinFailed'), message: e.message, color: 'red' });
    }
    await signIn(d, next);
  };

  return (
    <AuthLayout compact title={invitation ? undefined : t('invitation.heading')}>
      {invitation ? <InvitationBanner {...invitation} /> : null}
      {msg ? (
        <>
          <Text style={[type.body, { marginTop: 14 }]} accessibilityRole="alert">{msg}</Text>
          <Button style={{ marginTop: 16 }} title={t('auth.logIn')} onPress={() => navigation.navigate('Login')} />
        </>
      ) : !invitation ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 }}>
          <ActivityIndicator color={colors.primary} />
          <Text style={type.body}>{t('invitation.loading')}</Text>
        </View>
      ) : (
        <>
          <Text style={[type.h2, { marginTop: 18 }]} accessibilityRole="header">{t('invitation.chooseHow')}</Text>
          <GoogleSignInButton navigation={navigation} intent="signup" label={t('auth.continueGoogle')} onIdToken={withGoogle} />
          <View style={a.orRow} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <View style={a.orLine} /><Text style={a.orT}>{t('auth.or')}</Text><View style={a.orLine} />
          </View>
          <Button style={{ marginTop: 12 }} icon="＋" title={t('invitation.register')} onPress={() => go('Register')} />
          <View style={a.links}>
            <Text style={type.small}>{t('invitation.haveAccount')}</Text>
            <Text style={a.linkT} onPress={() => go('Login')} accessibilityRole="link">{t('auth.logIn')}</Text>
          </View>
        </>
      )}
    </AuthLayout>
  );
}
