// Frame 1 · Auth — FR-1. Web parity: web/src/pages/AuthPages.jsx.
// Endpoints: POST /auth/login · /auth/register · /auth/google · /auth/forgot · /auth/reset · verify-email.
// 3-30 a-z0-9_.-, password 8+ letter+digit, rate-limit 5/min/IP + lockout 423.
// All copy comes from the shared catalogue (EN/VI) — see ../prefs.
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ScrollView, ActivityIndicator } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri, useAuthRequest, ResponseType } from 'expo-auth-session';
import Constants from 'expo-constants';
import { useAuth, savedCredentials } from '../auth/AuthContext';
import { useT } from '../prefs';
import { colors } from '../theme';
import { api } from '../api/client';
import { SpinButton, ErrText } from '../ui';

const USER_RE = /^[a-z0-9_.-]{3,30}$/;
const googleClientId = Constants?.expoConfig?.extra?.googleClientId || '';

export default function AuthScreen({ navigation }) {
  const t = useT();
  const { login, loginWithStored } = useAuth();
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [e, setE] = useState(null);

  const doLogin = async () => {
    setBusy(true); setE(null);
    try {
      await login(id.trim(), pw);
    } catch (err) {
      setE(err);
      if (err.code === 'LOCKED_OUT') Alert.alert(t('m.auth.lockedOutTitle'), t('m.auth.lockedOutBody'));
    } finally {
      setBusy(false);
    }
  };

  const doBiometric = async () => {
    try {
      const creds = await savedCredentials();
      if (!creds) return Alert.alert(t('m.auth.biometricTitle'), t('m.auth.biometricSetup'));
      const has = await LocalAuthentication.hasHardwareAsync();
      if (!has) return Alert.alert(t('m.auth.biometricTitle'), t('m.auth.noBiometric'));
      const r = await LocalAuthentication.authenticateAsync({ promptMessage: t('m.auth.biometricPrompt') });
      if (!r.success) return;
      setBusy(true);
      try {
        await loginWithStored(creds.username, creds.password);
      } catch (err) {
        setE(err);
        Alert.alert(t('m.auth.biometricFailedTitle'), err.message || err.code);
      } finally {
        setBusy(false);
      }
    } catch (err) {
      Alert.alert(t('m.auth.biometricTitle'), err.message);
    }
  };

  // Real Google OAuth on device: implicit id_token flow, verified server-side.
  const redirectUri = makeRedirectUri({ scheme: 'splitshare', path: 'google' });
  const [request, response, promptAsync] = useAuthRequest(
    googleClientId
      ? {
        clientId: googleClientId,
        redirectUri,
        responseType: ResponseType.IdToken,
        scopes: ['openid', 'email', 'profile'],
      }
      : { clientId: 'unconfigured', redirectUri, responseType: ResponseType.IdToken },
    { authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth' },
  );
  const { google } = useAuth();

  useEffect(() => {
    if (response?.type !== 'success') {
      if (response?.type === 'error') setE({ code: 'VALIDATION', message: t('auth.googleCancelled') });
      return;
    }
    const idToken = response.params?.id_token;
    if (!idToken) return;
    (async () => {
      setBusy(true);
      try { await google(idToken); } catch (err) { setE(err); } finally { setBusy(false); }
    })();
  }, [response]);

  const doGoogle = async () => {
    if (!googleClientId) {
      // Not configured in this build: keep the documented paste fallback.
      Alert.alert(t('auth.continueGoogle'), t('m.auth.googleUnconfigured'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('m.auth.pasteToken'), onPress: () => navigation.navigate('GoogleToken') },
      ]);
      return;
    }
    await WebBrowser.warmUpAsync().catch(() => {});
    await promptAsync().catch((err) => Alert.alert(t('auth.continueGoogle'), err.message));
  };

  return (
    <ScrollView style={s.wrap} contentContainerStyle={{ gap: 10, paddingBottom: 24 }}>
      <View style={s.logo}>
        <View style={s.logoBox}><Text style={s.logoS}>S</Text></View>
        <Text style={s.title}>SplitShare</Text>
        <Text style={s.sub}>{t('m.auth.tagline')}</Text>
      </View>
      <View style={s.card}>
        <Text style={s.h}>{t('auth.welcomeBack')}</Text>
        <Text style={s.muted}>{t('m.auth.offlineDrafts')}</Text>
        <TextInput style={s.inp} value={id} onChangeText={setId} autoCapitalize="none" placeholder={t('auth.usernameOrEmail')} />
        <View style={s.pwRow}>
          <TextInput style={[s.inp, { flex: 1 }]} value={pw} onChangeText={setPw} secureTextEntry={!show} placeholder={t('auth.password')} />
          <Pressable onPress={() => setShow(!show)} accessibilityRole="button">
            <Text style={s.link}>{show ? t('m.auth.hide') : t('m.auth.show')}</Text>
          </Pressable>
        </View>
        <ErrText e={e} />
        <SpinButton title={t('auth.logIn')} busy={busy} onPress={doLogin} />
        <Pressable style={[s.btn, s.btnSec]} onPress={doBiometric} accessibilityRole="button">
          <Text style={[s.btnT, s.btnSecT]}>{t('m.auth.faceId')}</Text>
        </Pressable>
        <View style={s.row}>
          <Text style={s.link} onPress={() => navigation.navigate('Forgot')}>{t('auth.forgotPassword')}</Text>
          <Text style={s.link} onPress={() => navigation.navigate('Register')}>{t('auth.createAccount')}</Text>
        </View>
      </View>
      <View style={s.card}>
        <Pressable style={s.ghost} onPress={doGoogle} accessibilityRole="button">
          <Text style={s.ghostT}>{t('auth.continueGoogle')}</Text>
        </Pressable>
        <Text style={s.mutedSm}>{t('m.auth.googleUnverified')}</Text>
      </View>
      <Text style={s.hint}>{t('m.auth.loginRules')}</Text>
      {busy && <ActivityIndicator />}
    </ScrollView>
  );
}

export function RegisterScreen({ navigation }) {
  const t = useT();
  const { register } = useAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [e, setE] = useState(null);

  const validPw = password.length >= 8 && /[a-zA-Z]/.test(password) && /\d/.test(password);

  const go = async () => {
    setE(null);
    if (!USER_RE.test(username.trim().toLowerCase())) return setE({ code: 'VALIDATION', message: t('m.auth.usernameRules') });
    if (!validPw) return setE({ code: 'VALIDATION', message: t('m.auth.passwordRules') });
    if (!displayName.trim() || displayName.trim().length > 50) return setE({ code: 'VALIDATION', message: t('m.auth.displayNameRules') });
    setBusy(true);
    try {
      const d = await register({
        username: username.trim().toLowerCase(),
        email: email.trim(),
        display_name: displayName.trim(),
        password,
        ...(phone.trim() ? { phone: phone.trim() } : {}),
      });
      const n = d?.auto_joined_groups?.length || 0;
      if (n > 0) Alert.alert(t('m.auth.welcomeTitle'), t('auth.autoJoined', { count: n }));
    } catch (err) {
      setE(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={s.wrap} contentContainerStyle={{ gap: 8 }}>
      <View style={s.card}>
        <Text style={s.h}>{t('auth.createAccount')}</Text>
        <Text style={s.muted}>{t('auth.startSplitting')}</Text>
        <TextInput style={s.inp} value={username} onChangeText={setUsername} autoCapitalize="none" placeholder={t('auth.username')} />
        <TextInput style={s.inp} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder={t('auth.email')} />
        <TextInput style={s.inp} value={displayName} onChangeText={setDisplayName} placeholder={t('auth.displayName')} />
        <TextInput style={s.inp} value={password} onChangeText={setPassword} secureTextEntry placeholder={t('auth.password')} />
        <TextInput style={s.inp} value={phone} onChangeText={setPhone} placeholder={t('m.auth.phoneOptional')} />
        <ErrText e={e} />
        <SpinButton title={t('auth.createAccount')} busy={busy} onPress={go} />
        <Text style={s.link} onPress={() => navigation.goBack()}>{t('auth.backToLogin')}</Text>
      </View>
    </ScrollView>
  );
}

export function ForgotScreen() {
  const t = useT();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <View style={s.wrap}><View style={s.card}>
      <Text style={s.h}>{t('auth.forgotPassword')}</Text>
      <Text style={s.muted}>{t('auth.resetHint')}</Text>
      <TextInput style={s.inp} value={email} onChangeText={setEmail} placeholder={t('auth.email')} autoCapitalize="none" keyboardType="email-address" />
      <SpinButton title={t('auth.sendResetLink')} busy={busy} onPress={async () => {
        setBusy(true);
        try { await api.post('/api/v1/auth/forgot', { email }); } catch { /* always 200 */ }
        finally { setBusy(false); }
        Alert.alert(t('m.auth.checkEmailTitle'), t('auth.resetSent'));
      }} />
    </View></View>
  );
}

export function ResetScreen({ route }) {
  const t = useT();
  const { token } = route.params || {};
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [e, setE] = useState(null);
  const { resetPassword } = useAuth();
  return (
    <View style={s.wrap}><View style={s.card}>
      <Text style={s.h}>{t('auth.resetPassword')}</Text>
      <Text style={s.muted}>{t('m.auth.resetLinkHint')}</Text>
      <TextInput style={s.inp} value={pw} onChangeText={setPw} secureTextEntry placeholder={t('auth.newPassword')} />
      <ErrText e={e} />
      <SpinButton title={t('auth.setPassword')} busy={busy} onPress={async () => {
        if (!token) { setE({ code: 'VALIDATION', message: t('m.auth.resetMissing') }); return; }
        setBusy(true); setE(null);
        try {
          // The API returns a token pair: the app lands signed in, like the web.
          await resetPassword(token, pw);
          Alert.alert(t('auth.resetPassword'), t('m.auth.resetDone'));
        } catch (err) { setE(err); } finally { setBusy(false); }
      }} />
    </View></View>
  );
}

export function VerifyEmailScreen({ route }) {
  const t = useT();
  const { token } = route.params || {};
  const { verifyEmail, refreshMe } = useAuth();
  const [state, setState] = useState(token ? 'working' : 'idle');
  const [message, setMessage] = useState('');
  const [value, setValue] = useState('');

  const run = async (tok) => {
    if (!tok) return;
    setState('working');
    try {
      await verifyEmail(tok);
      await refreshMe();
      setState('done');
      setMessage(t('auth.emailVerified'));
    } catch (err) {
      setState('error');
      setMessage(t('auth.verificationFailed', { message: err.message || err.code || '' }));
    }
  };

  useEffect(() => { if (token) run(token); }, [token]);

  return (
    <View style={s.wrap}><View style={s.card}>
      <Text style={s.h}>{t('auth.emailVerification')}</Text>
      {state === 'working' && <><Text style={s.muted}>{t('auth.verifying')}</Text><ActivityIndicator style={{ marginTop: 10 }} /></>}
      {state === 'done' && <Text style={s.muted}>{message}</Text>}
      {state === 'error' && <Text style={[s.muted, { color: colors.debtorText }]}>{message}</Text>}
      {!token && (
        <>
          <Text style={s.muted}>{t('m.auth.verifyHint')}</Text>
          <TextInput style={s.inp} value={value} onChangeText={setValue} autoCapitalize="none" placeholder={t('m.auth.verifyPlaceholder')} />
          <SpinButton title={t('m.auth.verifyAction')} onPress={() => run(value.trim())} busy={state === 'working'} />
        </>
      )}
    </View></View>
  );
}

export function GoogleTokenScreen() {
  const t = useT();
  const { google } = useAuth();
  const [tok, setTok] = useState('');
  const [busy, setBusy] = useState(false);
  const [e, setE] = useState(null);
  return (
    <View style={s.wrap}><View style={s.card}>
      <Text style={s.h}>{t('m.auth.googleTokenTitle')}</Text>
      <Text style={s.muted}>{t('m.auth.googleTokenHint')}</Text>
      <TextInput style={[s.inp, { minHeight: 90 }]} value={tok} onChangeText={setTok} multiline placeholder="id_token" autoCapitalize="none" />
      <ErrText e={e} />
      <SpinButton title={t('auth.continueGoogle')} busy={busy} onPress={async () => {
        setBusy(true); setE(null);
        try { await google(tok.trim()); } catch (err) { setE(err); } finally { setBusy(false); }
      }} />
    </View></View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.screen, padding: 14 },
  logo: { alignItems: 'center', marginBottom: 4, marginTop: 24 },
  logoBox: { width: 56, height: 56, backgroundColor: colors.primary, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  logoS: { fontSize: 26, color: '#fff', fontWeight: '800' },
  title: { fontSize: 19, fontWeight: '800', marginTop: 10 },
  sub: { fontSize: 12, color: colors.secondary },
  card: { backgroundColor: colors.card, borderColor: colors.cardBorder, borderWidth: 1, borderRadius: 16, padding: 13 },
  h: { fontSize: 13, fontWeight: '800' },
  muted: { fontSize: 12, color: colors.secondary },
  mutedSm: { fontSize: 11, color: colors.secondary, textAlign: 'center', marginTop: 8 },
  inp: { backgroundColor: '#fff', borderColor: colors.inputBorder, borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 13, marginTop: 8 },
  pwRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btn: { backgroundColor: colors.primary, borderRadius: 12, padding: 13, alignItems: 'center', marginTop: 10, minHeight: 44 },
  btnT: { color: '#fff', fontWeight: '700', fontSize: 14 },
  btnSec: { backgroundColor: colors.lightTealBg },
  btnSecT: { color: colors.darkTealText },
  ghost: { borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 12, padding: 13, alignItems: 'center', minHeight: 44 },
  ghostT: { fontWeight: '700' },
  link: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  hint: { fontSize: 11, color: colors.secondary, textAlign: 'center' },
});
