// Frame 1 · Auth — login / biometric / Google (FR-1).
// Design: docs/mobile-design.html §1. Web parity: web/src/pages/AuthPages.jsx
// (Login/Register/Forgot/Reset/Verify collapsed here to one login frame +
//  links; Register/Forgot are stack screens reusing the same card style).
// API: POST /auth/login · /auth/google · /auth/forgot (15-min single-use link).
// Rules shown: username 3-30 a-z0-9_.-, password 8+ letter+digit, unverified
// Google email rejected, rate-limit 5/min/IP + 10-fails lockout 423.
import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useAuth } from '../auth/AuthContext';
import { colors } from '../theme';
import { api } from '../api/client';

export default function AuthScreen({ navigation }) {
  const { login } = useAuth();
  const [id, setId] = useState('mia@example.com');
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const doLogin = async () => {
    setBusy(true);
    try {
      await login(id.trim(), pw);
    } catch (e) {
      Alert.alert('Login failed', e.code === 'LOCKED_OUT' ? 'Too many attempts — try again in 15 min.' : e.message || e.code);
    } finally {
      setBusy(false);
    }
  };

  const doBiometric = async () => {
    // TODO(V1-next): retrieve credentials from SecureStore after first login
    // + enable via LocalAuthentication.authenticateAsync(); Keychain-backed.
    const ok = await LocalAuthentication.hasHardwareAsync();
    if (!ok) return Alert.alert('Biometric', 'No biometric hardware (stub — stored credential login TODO).');
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Log in to SplitShare' });
    if (r.success) Alert.alert('Biometric', 'Authenticated (stub) — stored credential login TODO.');
  };

  return (
    <View style={s.wrap}>
      <View style={s.logo}>
        <View style={s.logoBox}><Text style={s.logoS}>S</Text></View>
        <Text style={s.title}>SplitShare</Text>
        <Text style={s.sub}>Split less. Settle smart.</Text>
      </View>
      <View style={s.card}>
        <Text style={s.h}>Welcome back 👋</Text>
        <Text style={s.muted}>Login to sync offline drafts</Text>
        <TextInput style={s.inp} value={id} onChangeText={setId} autoCapitalize="none" placeholder="email or username" />
        <View style={s.pwRow}>
          <TextInput style={[s.inp, { flex: 1 }]} value={pw} onChangeText={setPw} secureTextEntry={!show} placeholder="password" />
          <Pressable onPress={() => setShow(!show)}><Text style={s.link}>{show ? 'Hide' : 'Show'}</Text></Pressable>
        </View>
        <Pressable style={s.btn} onPress={doLogin} disabled={busy}>
          <Text style={s.btnT}>{busy ? 'Logging in…' : 'Log in'}</Text>
        </Pressable>
        <Pressable style={[s.btn, s.btnSec]} onPress={doBiometric}>
          <Text style={[s.btnT, s.btnSecT]}>🔓 Face ID / Fingerprint</Text>
        </Pressable>
        <View style={s.row}>
          <Text style={s.link} onPress={() => navigation.navigate('Forgot')}>Forgot password?</Text>
          <Text style={s.link} onPress={() => navigation.navigate('Register')}>Create account</Text>
        </View>
      </View>
      <View style={s.card}>
        {/* Google: native ID-token via expo-auth-session (TODO) -> POST /auth/google */}
        <Pressable style={s.ghost} onPress={() => Alert.alert('Google', 'Native Google ID-token wiring TODO -> POST /api/v1/auth/google')}>
          <Text style={s.ghostT}>Ⓖ Continue with Google</Text>
        </Pressable>
        <Text style={s.mutedSm}>Unverified Google email → rejected · link if email exists</Text>
      </View>
      <Text style={s.hint}>username 3–30 a-z0-9_.- · password 8+ letter+digit</Text>
    </View>
  );
}

export function RegisterScreen() {
  return (
    <View style={s.wrap}><View style={s.card}>
      <Text style={s.h}>Create account</Text>
      {/* Fields: username/email/display_name/password/phone — POST /auth/register.
          Returns auto_joined_groups (pending email ≤30d auto-consumed). Full form TODO. */}
      <Text style={s.muted}>POST /api/v1/auth/register — full form TODO (stub screen).</Text>
    </View></View>
  );
}

export function ForgotScreen() {
  const [email, setEmail] = useState('');
  return (
    <View style={s.wrap}><View style={s.card}>
      <Text style={s.h}>Forgot password</Text>
      <TextInput style={s.inp} value={email} onChangeText={setEmail} placeholder="email" autoCapitalize="none" />
      <Pressable style={s.btn} onPress={async () => {
        await api.post('/api/v1/auth/forgot', { email }).catch(() => {});
        Alert.alert('Check email', 'If the address exists, a 15-min single-use link is on its way.');
      }}><Text style={s.btnT}>Send reset link</Text></Pressable>
    </View></View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.screen, padding: 14, gap: 10, justifyContent: 'center' },
  logo: { alignItems: 'center', marginBottom: 4 },
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
