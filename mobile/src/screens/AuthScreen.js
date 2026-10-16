// Frame 1 · Auth — FR-1. Web parity: web/src/pages/AuthPages.jsx.
// Endpoints: POST /auth/login · /auth/register · /auth/google · /auth/forgot · /auth/reset · verify-email.
// 3-30 a-z0-9_.-, password 8+ letter+digit, rate-limit 5/min/IP + lockout 423.
import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ScrollView, ActivityIndicator } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import Constants from 'expo-constants';
import { useAuth, savedCredentials } from '../auth/AuthContext';
import { colors } from '../theme';
import { api } from '../api/client';
import { SpinButton, ErrText } from '../ui';

const USER_RE = /^[a-z0-9_.-]{3,30}$/;
const googleClientId = Constants?.expoConfig?.extra?.googleClientId || '';

export default function AuthScreen({ navigation }) {
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
      if (err.code === 'LOCKED_OUT') Alert.alert('Locked', 'Too many attempts — try again in 15 min.');
    } finally {
      setBusy(false);
    }
  };

  const doBiometric = async () => {
    try {
      const creds = await savedCredentials();
      if (!creds) return Alert.alert('Biometric', 'Log in once with password first to enable biometric unlock.');
      const has = await LocalAuthentication.hasHardwareAsync();
      if (!has) return Alert.alert('Biometric', 'No biometric hardware on this device.');
      const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock SplitShare' });
      if (!r.success) return;
      setBusy(true);
      try {
        await loginWithStored(creds.username, creds.password);
      } catch (err) {
        setE(err);
        Alert.alert('Biometric login failed', err.message || err.code);
      } finally {
        setBusy(false);
      }
    } catch (err) {
      Alert.alert('Biometric', err.message);
    }
  };

  const doGoogle = () => {
    // Native ID-token via expo-auth-session requires VITE_GOOGLE_CLIENT_ID equivalent.
    // If configured, deep-link flow returns id_token -> POST /auth/google.
    // Otherwise fall back to manual paste (dev / simulator).
    Alert.alert(
      'Continue with Google',
      googleClientId
        ? 'Native Google flow is configured — paste the ID token to finish (expo-auth-session wiring).'
        : 'Set extra.googleClientId in app.json to enable the native button. Paste an ID token for now.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Paste ID token', onPress: () => navigation.navigate('GoogleToken'),
        },
      ]
    );
  };

  return (
    <ScrollView style={s.wrap} contentContainerStyle={{ gap: 10, paddingBottom: 24 }}>
      <View style={s.logo}>
        <View style={s.logoBox}><Text style={s.logoS}>S</Text></View>
        <Text style={s.title}>SplitShare</Text>
        <Text style={s.sub}>Split less. Settle smart.</Text>
      </View>
      <View style={s.card}>
        <Text style={s.h}>Welcome back</Text>
        <Text style={s.muted}>Login to sync offline drafts</Text>
        <TextInput style={s.inp} value={id} onChangeText={setId} autoCapitalize="none" placeholder="email or username" />
        <View style={s.pwRow}>
          <TextInput style={[s.inp, { flex: 1 }]} value={pw} onChangeText={setPw} secureTextEntry={!show} placeholder="password" />
          <Pressable onPress={() => setShow(!show)}><Text style={s.link}>{show ? 'Hide' : 'Show'}</Text></Pressable>
        </View>
        <ErrText e={e} />
        <SpinButton title={busy ? 'Logging in…' : 'Log in'} busy={busy} onPress={doLogin} />
        <Pressable style={[s.btn, s.btnSec]} onPress={doBiometric}>
          <Text style={[s.btnT, s.btnSecT]}>Face ID / Fingerprint</Text>
        </Pressable>
        <View style={s.row}>
          <Text style={s.link} onPress={() => navigation.navigate('Forgot')}>Forgot password?</Text>
          <Text style={s.link} onPress={() => navigation.navigate('Register')}>Create account</Text>
        </View>
      </View>
      <View style={s.card}>
        <Pressable style={s.ghost} onPress={doGoogle}>
          <Text style={s.ghostT}>Continue with Google</Text>
        </Pressable>
        <Text style={s.mutedSm}>Unverified Google email → rejected · link if email exists</Text>
      </View>
      <Text style={s.hint}>username 3–30 a-z0-9_.- · password 8+ letter+digit</Text>
      {busy && <ActivityIndicator />}
    </ScrollView>
  );
}

export function RegisterScreen({ navigation }) {
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
    if (!USER_RE.test(username.trim().toLowerCase())) return setE({ code: 'VALIDATION', message: 'Username: 3-30 chars a-z0-9_.-' });
    if (!validPw) return setE({ code: 'VALIDATION', message: 'Password: min 8 chars, 1 letter + 1 digit.' });
    if (!displayName.trim() || displayName.trim().length > 50) return setE({ code: 'VALIDATION', message: 'Display name: 1-50 chars.' });
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
      if (n > 0) Alert.alert('Welcome', `Auto-joined ${n} pending group invite(s).`);
    } catch (err) {
      setE(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={s.wrap} contentContainerStyle={{ gap: 8 }}>
      <View style={s.card}>
        <Text style={s.h}>Create account</Text>
        <TextInput style={s.inp} value={username} onChangeText={setUsername} autoCapitalize="none" placeholder="username (3-30 a-z0-9_.-)" />
        <TextInput style={s.inp} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="email" />
        <TextInput style={s.inp} value={displayName} onChangeText={setDisplayName} placeholder="display name (1-50)" />
        <TextInput style={s.inp} value={password} onChangeText={setPassword} secureTextEntry placeholder="password (8+ letter+digit)" />
        <TextInput style={s.inp} value={phone} onChangeText={setPhone} placeholder="phone (optional, free-text)" />
        <ErrText e={e} />
        <SpinButton title="Create account" busy={busy} onPress={go} />
        <Text style={s.link} onPress={() => navigation.goBack()}>Back to login</Text>
      </View>
    </ScrollView>
  );
}

export function ForgotScreen() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <View style={s.wrap}><View style={s.card}>
      <Text style={s.h}>Forgot password</Text>
      <TextInput style={s.inp} value={email} onChangeText={setEmail} placeholder="email" autoCapitalize="none" keyboardType="email-address" />
      <SpinButton title="Send reset link" busy={busy} onPress={async () => {
        setBusy(true);
        try { await api.post('/api/v1/auth/forgot', { email }); } catch { /* always 200 */ }
        finally { setBusy(false); }
        Alert.alert('Check email', 'If the address exists, a 15-min single-use link is on its way.');
      }} />
    </View></View>
  );
}

export function ResetScreen({ route, navigation }) {
  const { token } = route.params || {};
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [e, setE] = useState(null);
  const { login } = useAuth();
  return (
    <View style={s.wrap}><View style={s.card}>
      <Text style={s.h}>Reset password</Text>
      <Text style={s.muted}>15-min single-use link</Text>
      <TextInput style={s.inp} value={pw} onChangeText={setPw} secureTextEntry placeholder="new password" />
      <ErrText e={e} />
      <SpinButton title="Reset & log in" busy={busy} onPress={async () => {
        setBusy(true); setE(null);
        try {
          await api.post('/api/v1/auth/reset', { token, new_password: pw });
          Alert.alert('Reset', 'Password updated. Please log in.');
          navigation.replace('Login');
        } catch (err) { setE(err); } finally { setBusy(false); }
      }} />
    </View></View>
  );
}

export function GoogleTokenScreen({ navigation }) {
  const { google } = useAuth();
  const [tok, setTok] = useState('');
  const [busy, setBusy] = useState(false);
  const [e, setE] = useState(null);
  return (
    <View style={s.wrap}><View style={s.card}>
      <Text style={s.h}>Google ID token</Text>
      <Text style={s.muted}>POST /auth/google — rejected if email unverified</Text>
      <TextInput style={[s.inp, { minHeight: 90 }]} value={tok} onChangeText={setTok} multiline placeholder="id_token" autoCapitalize="none" />
      <ErrText e={e} />
      <SpinButton title="Continue with Google" busy={busy} onPress={async () => {
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
