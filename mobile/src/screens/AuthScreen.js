// Auth — web parity: web/src/pages/AuthPages.jsx (AuthLayout, Login, Register, Forgot, Reset)
// adapted to native: dark hero with brand mark + language switch, bright form card,
// biometric unlock, Google with a paste-token fallback, dev-only API URL switcher.
import React, { useRef, useState } from 'react';
import { View, Text, Alert, Pressable } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useAuth, savedCredentials } from '../auth/AuthContext';
import { colors, type } from '../theme';
import { api, setTokens } from '../api/client';
import { Button, Field, Input, DevApiUrlCard } from '../ui';
import { useT } from '../i18n';
import { AuthLayout, AccountErr, PasswordInput, a } from '../components/account/AccountKit';

// Same client-side rules as before / server (username 3–30 a-z0-9_.-, pw 8+ letter+digit, name 1–50).
const USER_RE = /^[a-z0-9_.-]{3,30}$/;
export const validPassword = (pw) => pw.length >= 8 && /[a-zA-Z]/.test(pw) && /\d/.test(pw);
const localErr = (message) => ({ friendly: true, message });

function OrDivider() {
  const t = useT();
  return (
    <View style={a.orRow} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={a.orLine} /><Text style={a.orT}>{t('auth.or')}</Text><View style={a.orLine} />
    </View>
  );
}

function GoogleButton({ navigation, intent = 'signin' }) {
  const t = useT();
  const label = t(intent === 'signup' ? 'auth.signUpGoogle' : 'auth.signInGoogle');
  // Native Google ID-token flow is not wired yet (needs expo-auth-session + client id);
  // keep the paste-token fallback that hands the token to /auth/google.
  const onPress = () => Alert.alert(t('m.account.googleTitle'), t('m.account.googleBody'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('m.account.googlePaste'), onPress: () => navigation.navigate('GoogleToken') },
  ]);
  return (
    <>
      <OrDivider />
      <Button style={{ marginTop: 12 }} variant="ghost" icon="G" title={label} onPress={onPress} />
    </>
  );
}

export default function AuthScreen({ navigation }) {
  const t = useT();
  const { login, loginWithStored } = useAuth();
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [e, setE] = useState(null);
  const pwRef = useRef(null);

  const doLogin = async () => {
    if (busy) return;
    setE(null);
    if (!id.trim() || !pw) return;
    setBusy(true);
    try {
      await login(id.trim(), pw);
    } catch (err) {
      setE(err);
      if (err.code === 'LOCKED_OUT') Alert.alert(t('m.account.lockedTitle'), t('m.account.err.LOCKED_OUT'));
    } finally {
      setBusy(false);
    }
  };

  const doBiometric = async () => {
    if (busy) return;
    try {
      const creds = await savedCredentials();
      if (!creds) return Alert.alert(t('m.account.biometricTitle'), t('m.account.biometricNeedLogin'));
      const has = await LocalAuthentication.hasHardwareAsync();
      if (!has) return Alert.alert(t('m.account.biometricTitle'), t('m.account.biometricNoHardware'));
      const r = await LocalAuthentication.authenticateAsync({ promptMessage: t('m.account.biometricPrompt') });
      if (!r.success) return;
      setBusy(true); setE(null);
      try {
        await loginWithStored(creds.username, creds.password);
      } catch (err) {
        setE(err);
        if (err.code === 'LOCKED_OUT') Alert.alert(t('m.account.lockedTitle'), t('m.account.err.LOCKED_OUT'));
      } finally {
        setBusy(false);
      }
    } catch (err) {
      Alert.alert(t('m.account.biometricFailed'), err.message || '');
    }
  };

  return (
    <AuthLayout
      title={t('auth.welcomeBack')}
      desc={t('auth.loginContinue')}
      footer={<DevApiUrlCard />}
    >
      <Field label={t('auth.usernameOrEmail')}>
        <Input
          value={id}
          onChangeText={setId}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          textContentType="username"
          returnKeyType="next"
          onSubmitEditing={() => pwRef.current?.focus?.()}
          accessibilityLabel={t('auth.usernameOrEmail')}
        />
      </Field>
      <Field label={t('auth.password')}>
        <PasswordInput value={pw} onChangeText={setPw} autoComplete="current-password" returnKeyType="go" onSubmitEditing={doLogin} />
      </Field>
      <AccountErr e={e} />
      <Button style={{ marginTop: 16 }} title={t('auth.logIn')} busy={busy} disabled={!id.trim() || !pw} onPress={doLogin} />
      <Button style={{ marginTop: 10 }} variant="soft" title={t('m.account.biometric')} onPress={doBiometric} disabled={busy} />
      <GoogleButton navigation={navigation} intent="signin" />
      <View style={a.links}>
        <Text style={a.linkT} onPress={() => navigation.navigate('Register')} accessibilityRole="link">{t('auth.register')}</Text>
        <Text style={{ color: colors.muted }} accessibilityElementsHidden>·</Text>
        <Text style={a.linkT} onPress={() => navigation.navigate('Forgot')} accessibilityRole="link">{t('auth.forgotPassword')}</Text>
      </View>
    </AuthLayout>
  );
}

export function RegisterScreen({ navigation }) {
  const t = useT();
  const { register } = useAuth();
  const [f, setF] = useState({ username: '', email: '', display_name: '', password: '', phone: '' });
  const [busy, setBusy] = useState(false);
  const [e, setE] = useState(null);
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));

  const go = async () => {
    if (busy) return;
    setE(null);
    const username = f.username.trim().toLowerCase();
    const name = f.display_name.trim();
    if (!USER_RE.test(username)) return setE(localErr(`${t('auth.username')}: ${t('m.account.usernameRule')}`));
    if (!f.email.trim()) return setE(localErr(`${t('auth.email')}: ${t('m.account.required')}`));
    if (!name || name.length > 50) return setE(localErr(`${t('auth.displayName')}: ${t('m.account.displayNameRule')}`));
    if (!validPassword(f.password)) return setE(localErr(`${t('auth.password')}: ${t('m.account.passwordRule')}`));
    setBusy(true);
    try {
      const d = await register({
        username,
        email: f.email.trim(),
        display_name: name,
        password: f.password,
        ...(f.phone.trim() ? { phone: f.phone.trim() } : {}),
      });
      const n = d?.auto_joined_groups?.length || 0;
      // Session is saved by register(); the stack swaps to the app. Announce auto-joins.
      if (n > 0) Alert.alert(t('m.account.welcome'), t('auth.autoJoined', { count: n }));
    } catch (err) {
      setE(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout compact title={t('auth.createAccount')} desc={t('auth.startSplitting')}>
      <Field label={t('auth.username')} hint={t('m.account.usernameRule')}>
        <Input value={f.username} onChangeText={set('username')} autoCapitalize="none" autoCorrect={false} autoComplete="username-new" maxLength={30} accessibilityLabel={t('auth.username')} />
      </Field>
      <Field label={t('auth.email')}>
        <Input value={f.email} onChangeText={set('email')} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" accessibilityLabel={t('auth.email')} />
      </Field>
      <Field label={t('auth.displayName')} hint={t('m.account.displayNameRule')}>
        <Input value={f.display_name} onChangeText={set('display_name')} maxLength={50} autoComplete="name" accessibilityLabel={t('auth.displayName')} />
      </Field>
      <Field label={t('auth.password')} hint={t('m.account.passwordRule')}>
        <PasswordInput value={f.password} onChangeText={set('password')} autoComplete="new-password" />
      </Field>
      <Field label={t('profile.phone')}>
        <Input value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" autoComplete="tel" accessibilityLabel={t('profile.phone')} />
      </Field>
      <AccountErr e={e} />
      <Button style={{ marginTop: 16 }} icon="＋" title={t('auth.register')} busy={busy} onPress={go} />
      <GoogleButton navigation={navigation} intent="signup" />
      <View style={a.links}>
        <Text style={a.linkT} onPress={() => navigation.goBack()} accessibilityRole="link">{t('auth.backToLogin')}</Text>
      </View>
    </AuthLayout>
  );
}

export function ForgotScreen({ navigation }) {
  const t = useT();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [e, setE] = useState(null);
  const go = async () => {
    if (busy || !email.trim()) return;
    setBusy(true); setE(null);
    try {
      await api.post('/api/v1/auth/forgot', { email: email.trim() });
      setDone(true);
    } catch (err) {
      // Server always answers 200 (no account enumeration); only network/rate errors land here.
      setE(err);
    } finally { setBusy(false); }
  };
  return (
    <AuthLayout compact title={t('auth.resetPassword')} desc={t('auth.resetHint')}>
      {done ? (
        <Text style={[type.body, { marginTop: 14 }]} accessibilityLiveRegion="polite">{t('auth.resetSent')}</Text>
      ) : (
        <>
          <Field label={t('auth.email')} hint={t('m.account.resetLinkHint')}>
            <Input value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" returnKeyType="send" onSubmitEditing={go} accessibilityLabel={t('auth.email')} />
          </Field>
          <AccountErr e={e} />
          <Button style={{ marginTop: 16 }} icon="✉" title={t('auth.sendResetLink')} busy={busy} disabled={!email.trim()} onPress={go} />
        </>
      )}
      <View style={a.links}>
        <Text style={a.linkT} onPress={() => navigation.navigate('Login')} accessibilityRole="link">{t('auth.backToLogin')}</Text>
      </View>
    </AuthLayout>
  );
}

export function ResetScreen({ route, navigation }) {
  const t = useT();
  const { token } = route.params || {};
  const { setUser, refreshMe } = useAuth();
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [e, setE] = useState(null);
  const go = async () => {
    if (busy) return;
    setE(null);
    if (!validPassword(pw)) return setE(localErr(`${t('auth.newPassword')}: ${t('m.account.passwordRule')}`));
    setBusy(true);
    try {
      const d = await api.post('/api/v1/auth/reset', { token, new_password: pw });
      // Web parity: reset returns a token pair and signs the user straight in.
      if (d?.access_token) {
        await setTokens(d.access_token, d.refresh_token);
        if (d.user) setUser(d.user); else await refreshMe();
      } else {
        navigation.replace('Login');
      }
    } catch (err) { setE(err); } finally { setBusy(false); }
  };
  return (
    <AuthLayout compact title={t('auth.newPassword')} desc={t('auth.chooseNewPassword')}>
      <Field label={t('auth.newPassword')} hint={t('m.account.passwordRule')}>
        <PasswordInput value={pw} onChangeText={setPw} autoComplete="new-password" returnKeyType="go" onSubmitEditing={go} />
      </Field>
      <AccountErr e={e} />
      <Button style={{ marginTop: 16 }} icon="🔒" title={t('auth.setPassword')} busy={busy} disabled={!pw} onPress={go} />
      <View style={a.links}>
        <Text style={a.linkT} onPress={() => navigation.navigate('Login')} accessibilityRole="link">{t('auth.backToLogin')}</Text>
      </View>
    </AuthLayout>
  );
}

export function GoogleTokenScreen({ navigation }) {
  const t = useT();
  const { google } = useAuth();
  const [tok, setTok] = useState('');
  const [busy, setBusy] = useState(false);
  const [e, setE] = useState(null);
  const go = async () => {
    if (busy || !tok.trim()) return;
    setBusy(true); setE(null);
    try { await google(tok.trim()); } catch (err) { setE(err); } finally { setBusy(false); }
  };
  return (
    <AuthLayout compact title={t('m.account.googleTokenTitle')} desc={t('m.account.googleTokenHint')}>
      <Field label={t('m.account.googleTokenPh')}>
        <Input
          style={{ minHeight: 110, textAlignVertical: 'top' }}
          value={tok}
          onChangeText={setTok}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={t('m.account.googleTokenPh')}
          accessibilityLabel={t('m.account.googleTokenPh')}
        />
      </Field>
      <AccountErr e={e} />
      <Button style={{ marginTop: 16 }} variant="ghost" icon="G" title={t('auth.continueGoogle')} busy={busy} disabled={!tok.trim()} onPress={go} />
      <View style={a.links}>
        <Pressable onPress={() => navigation.goBack()} accessibilityRole="link" hitSlop={6}>
          <Text style={a.linkT}>{t('auth.backToLogin')}</Text>
        </Pressable>
      </View>
    </AuthLayout>
  );
}
