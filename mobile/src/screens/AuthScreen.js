// Auth — web parity: web/src/pages/AuthPages.jsx (AuthLayout, Login, Register, Forgot, Reset)
// adapted to native: dark hero with brand mark + language switch, bright form card,
// biometric unlock, Google with a paste-token fallback, dev-only API URL switcher.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Alert, Pressable } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useAuth, savedCredentials } from '../auth/AuthContext';
import { colors, type } from '../theme';
import { api, setTokens } from '../api/client';
import { Button, Field, Input, Segmented, DevApiUrlCard } from '../ui';
import { useT } from '../i18n';
import { AuthLayout, AccountErr, PasswordInput, a } from '../components/account/AccountKit';
import { nativeGoogleAvailable, useGoogleIdToken } from '../auth/google';
import { InvitationBanner } from '../components/account/InvitationBanner';

// Same client-side rules as the server (pw 8+ letter+digit). Sign-up is email-only:
// the email is the username and the display name is set later in Profile.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (v) => EMAIL_RE.test((v || '').trim());
export const validPassword = (pw) => pw.length >= 8 && /[a-zA-Z]/.test(pw) && /\d/.test(pw);
const localErr = (message) => ({ friendly: true, message });

/** Email field + primary button; calls onContinue(normalizedEmail) when valid. */
function EmailStep({ initial = '', title, onContinue, busy, icon = '✉' }) {
  const t = useT();
  const [email, setEmail] = useState(initial);
  const [err, setErr] = useState(null);
  const go = () => {
    const v = email.trim().toLowerCase();
    if (!isEmail(v)) return setErr(t('auth.emailInvalid'));
    setErr(null);
    return onContinue(v);
  };
  return (
    <>
      <Field label={t('auth.email')} error={err}>
        <Input
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
          placeholder={t('auth.emailPlaceholder')}
          returnKeyType="go"
          onSubmitEditing={go}
          error={!!err}
          accessibilityLabel={t('auth.email')}
        />
      </Field>
      <Button style={{ marginTop: 16 }} icon={icon} title={title || t('auth.continue')} busy={busy} disabled={!email.trim()} onPress={go} />
    </>
  );
}

/** The chosen email, with a "Change" link when onChange is given. */
function EmailChip({ email, onChange }) {
  const t = useT();
  return (
    <View style={[a.links, { justifyContent: 'flex-start', marginTop: 12 }]}>
      <Text style={[type.h3, { flexShrink: 1 }]} numberOfLines={1}>{email}</Text>
      {onChange ? <Text style={a.linkT} onPress={onChange} accessibilityRole="link">{t('auth.changeEmail')}</Text> : null}
    </View>
  );
}

/** Sends a code; onSent(email, resendAfterSeconds). A cooldown means a fresh code is already out. */
function useSendCode(onSent) {
  const { requestOtp } = useAuth();
  const [busy, setBusy] = useState(false);
  const [e, setE] = useState(null);
  const send = async (email) => {
    if (busy) return;
    setBusy(true); setE(null);
    try {
      const r = await requestOtp(email);
      onSent(email, r?.resend_after_seconds ?? 60);
    } catch (err) {
      if (err?.code === 'OTP_COOLDOWN') onSent(email, 60); else setE(err);
    } finally { setBusy(false); }
  };
  return [send, busy, e];
}

/**
 * 6-digit code entry with resend countdown. Verifies on the 6th digit.
 * Defaults to sign-in; pass submit(code) / request() to reuse it (Profile → Verify email),
 * with onDone(result) after a successful submit.
 */
export function OtpStep({ email, onBack, resendAfter = 60, submit, request, submitLabel, onDone }) {
  const t = useT();
  const auth = useAuth();
  const verifyOtp = (_, value) => (submit ? submit(value) : auth.verifyOtp(email, value));
  const requestOtp = () => (request ? request() : auth.requestOtp(email));
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [e, setE] = useState(null);
  const [left, setLeft] = useState(resendAfter);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (left <= 0) return undefined;
    const id = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [left]);

  // Sign-in success swaps the auth stack for the app stack (this unmounts); reuse calls onDone.
  const verify = async (value = code) => {
    if (busy || value.length !== 6) return;
    setBusy(true); setE(null);
    try {
      const r = await verifyOtp(email, value);
      if (onDone) { setBusy(false); onDone(r); }
    } catch (err) { setE(err); setCode(''); setBusy(false); }
  };
  const onChange = (v) => {
    const digits = v.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    if (digits.length === 6) verify(digits);
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
    <>
      <Text style={[type.body, { marginTop: 14 }]} accessibilityLiveRegion="polite">{t('auth.codeSentTo', { email })}</Text>
      {onBack ? <EmailChip email={email} onChange={onBack} /> : null}
      <Field label={t('auth.code')}>
        <Input
          value={code}
          onChangeText={onChange}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={6}
          autoFocus
          editable={!busy}
          style={{ fontSize: 24, letterSpacing: 10, textAlign: 'center', fontWeight: '700' }}
          accessibilityLabel={t('auth.code')}
        />
      </Field>
      <AccountErr e={e} />
      <Button style={{ marginTop: 16 }} icon="🔒" title={submitLabel || t('auth.verifyCode')} busy={busy} disabled={code.length !== 6} onPress={() => verify()} />
      <View style={a.links}>
        {left > 0
          ? <Text style={type.small}>{t('auth.resendIn', { seconds: left })}</Text>
          : <Text style={a.linkT} onPress={resend} accessibilityRole="link">{t('auth.resendCode')}</Text>}
      </View>
      {resent && left > 0 ? <Text style={[type.small, { textAlign: 'center' }]}>{t('auth.codeResent')}</Text> : null}
    </>
  );
}

/**
 * The one login form (web LoginForm parity): Password or Email code. Used by the
 * login screen and the invitation login step. beforeSignIn runs right before the
 * request (e.g. set the post-auth route); onFail undoes it.
 */
export function LoginForm({ initialEmail = '', submitLabel, beforeSignIn, onFail }) {
  const t = useT();
  const { login } = useAuth();
  const [method, setMethod] = useState('password');
  const [id, setId] = useState(initialEmail);
  const [pw, setPw] = useState('');
  const [codeFor, setCodeFor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [e, setE] = useState(null);
  const pwRef = useRef(null);
  const [send, sending, sendErr] = useSendCode((email, wait) => setCodeFor({ email, wait }));

  const doLogin = async () => {
    if (busy || !id.trim() || !pw) return;
    setE(null);
    setBusy(true);
    beforeSignIn?.();
    try {
      await login(id.trim(), pw);
    } catch (err) {
      onFail?.();
      setE(err);
      setBusy(false);
      if (err.code === 'LOCKED_OUT') Alert.alert(t('m.account.lockedTitle'), t('m.account.err.LOCKED_OUT'));
    }
  };
  const sendCode = (email) => { setId(email); beforeSignIn?.(); send(email); };

  return (
    <>
      <View style={{ marginTop: 14 }}>
        <Segmented
          options={[
            { value: 'password', label: t('auth.methodPassword') },
            { value: 'code', label: t('auth.methodCode') },
          ]}
          value={method}
          onChange={(m) => { setMethod(m); setE(null); setCodeFor(null); }}
        />
      </View>
      {method === 'password' ? (
        <>
          <Field label={t('auth.email')}>
            <Input
              value={id}
              onChangeText={setId}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="username"
              textContentType="username"
              placeholder={t('auth.emailPlaceholder')}
              returnKeyType="next"
              onSubmitEditing={() => pwRef.current?.focus?.()}
              accessibilityLabel={t('auth.email')}
            />
          </Field>
          <Field label={t('auth.password')}>
            <PasswordInput value={pw} onChangeText={setPw} autoComplete="current-password" returnKeyType="go" onSubmitEditing={doLogin} />
          </Field>
          <AccountErr e={e} />
          <Button style={{ marginTop: 16 }} title={submitLabel || t('auth.logIn')} busy={busy} disabled={!id.trim() || !pw} onPress={doLogin} />
        </>
      ) : codeFor ? (
        <OtpStep key={codeFor.email} email={codeFor.email} resendAfter={codeFor.wait} onBack={() => setCodeFor(null)} />
      ) : (
        <>
          <EmailStep initial={isEmail(id) ? id.trim() : initialEmail} title={t('auth.sendCode')} busy={sending} onContinue={sendCode} />
          <AccountErr e={sendErr} />
        </>
      )}
    </>
  );
}

function OrDivider() {
  const t = useT();
  return (
    <View style={a.orRow} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={a.orLine} /><Text style={a.orT}>{t('auth.or')}</Text><View style={a.orLine} />
    </View>
  );
}

function NativeGoogleButton({ label, loginHint, onIdToken }) {
  const [busy, setBusy] = useState(false);
  const [e, setE] = useState(null);
  const { ready, start } = useGoogleIdToken({
    loginHint,
    onIdToken: async (tok) => {
      try { await onIdToken(tok); } catch (err) { setE(err); } finally { setBusy(false); }
    },
    onError: (msg) => { setBusy(false); if (msg) setE(localErr(msg)); },
  });
  const onPress = () => {
    if (busy) return;
    setE(null);
    setBusy(true);
    start().catch((err) => { setBusy(false); setE(localErr(err?.message || String(err))); });
  };
  return (
    <>
      <Button style={{ marginTop: 12 }} variant="ghost" icon="G" title={label} busy={busy} disabled={!ready} onPress={onPress} />
      <AccountErr e={e} />
    </>
  );
}

/**
 * Google sign-in: native ID-token flow when this build has the platform client ID
 * (see auth/google.js); otherwise the paste-token fallback (GoogleToken screen).
 * onIdToken overrides the default exchange (useAuth().google).
 */
export function GoogleSignInButton({ navigation, intent = 'signin', loginHint, onIdToken, label: labelOverride }) {
  const t = useT();
  const { google } = useAuth();
  const label = labelOverride || t(intent === 'signup' ? 'auth.signUpGoogle' : 'auth.signInGoogle');
  if (nativeGoogleAvailable()) {
    return <NativeGoogleButton label={label} loginHint={loginHint} onIdToken={onIdToken || google} />;
  }
  const onPress = () => Alert.alert(t('m.account.googleTitle'), t('m.account.googleBody'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('m.account.googlePaste'), onPress: () => navigation.navigate('GoogleToken') },
  ]);
  return <Button style={{ marginTop: 12 }} variant="ghost" icon="G" title={label} onPress={onPress} />;
}

function GoogleButton({ navigation, intent = 'signin' }) {
  return (
    <>
      <OrDivider />
      <GoogleSignInButton navigation={navigation} intent={intent} />
    </>
  );
}

export default function AuthScreen({ navigation, route }) {
  const invitation = route?.params?.invitation;
  const t = useT();
  const { loginWithStored } = useAuth();
  const [busy, setBusy] = useState(false);
  const [e, setE] = useState(null);

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
      banner={invitation ? <InvitationBanner {...invitation} /> : null}
    >
      <LoginForm />
      <AccountErr e={e} />
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

/**
 * The one registration form (web RegisterForm parity), used by RegisterScreen and
 * the invitation register step: email → "Email me a code" | "Use a password".
 * lockEmail skips the email step (invited address). Signing in swaps the auth stack
 * for the app stack; beforeSignIn runs first (e.g. set the post-auth route) and
 * onFail undoes it. onEmailTaken, when given, handles an existing account.
 */
export function RegisterForm({ initialEmail = '', lockEmail = false, submitLabel, beforeSignIn, onFail, onEmailTaken }) {
  const t = useT();
  const { register } = useAuth();
  const [step, setStep] = useState(lockEmail ? 'method' : 'email'); // email | method | code | password
  const [email, setEmail] = useState(initialEmail.trim().toLowerCase());
  const [wait, setWait] = useState(60);
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [e, setE] = useState(null);
  const [send, sending, sendErr] = useSendCode((_, w) => { setWait(w); setStep('code'); });
  const toEmail = lockEmail ? null : () => { setStep('email'); setE(null); setPw(''); };
  const toMethod = () => { setStep('method'); setE(null); setPw(''); };
  const sendCode = () => { beforeSignIn?.(); send(email); };

  const create = async () => {
    if (busy) return;
    setE(null);
    if (!validPassword(pw)) return setE(localErr(`${t('auth.password')}: ${t('m.account.passwordRule')}`));
    setBusy(true);
    beforeSignIn?.();
    try {
      // Session is saved by register(); the stack swaps to the app.
      await register({ email, password: pw });
    } catch (err) {
      onFail?.();
      setBusy(false);
      if (err?.code === 'EMAIL_TAKEN' && onEmailTaken) onEmailTaken(); else setE(err);
    }
    return undefined;
  };

  let body;
  if (step === 'email') {
    body = (
      <>
        <EmailStep initial={email} onContinue={(v) => { setEmail(v); setStep('method'); }} />
        <Text style={[type.small, { marginTop: 12 }]}>{t('auth.displayNameLater')}</Text>
      </>
    );
  } else if (step === 'method') {
    body = (
      <>
        <EmailChip email={email} onChange={toEmail} />
        <Text style={[type.small, { marginTop: 4 }]}>{t('auth.chooseMethod')}</Text>
        <Button style={{ marginTop: 12 }} icon="✉" title={t('auth.useCode')} busy={sending} onPress={sendCode} />
        <Button style={{ marginTop: 10 }} variant="soft" icon="🔒" title={t('auth.usePassword')} disabled={sending} onPress={() => setStep('password')} />
        <AccountErr e={sendErr} />
      </>
    );
  } else if (step === 'code') {
    body = <OtpStep email={email} resendAfter={wait} onBack={toEmail || toMethod} />;
  } else {
    body = (
      <>
        <EmailChip email={email} onChange={toEmail || toMethod} />
        <Field label={t('auth.password')} hint={t('m.account.passwordRule')}>
          <PasswordInput value={pw} onChangeText={setPw} autoComplete="new-password" returnKeyType="go" onSubmitEditing={create} />
        </Field>
        <AccountErr e={e} />
        <Button style={{ marginTop: 16 }} icon="＋" title={submitLabel || t('auth.createAccount')} busy={busy} disabled={!pw} onPress={create} />
      </>
    );
  }
  return body;
}

export function RegisterScreen({ navigation, route }) {
  const invitation = route?.params?.invitation;
  const t = useT();
  return (
    <AuthLayout
      compact
      title={t('auth.createAccount')}
      desc={t('auth.startSplitting')}
      banner={invitation ? <InvitationBanner {...invitation} /> : null}
    >
      <RegisterForm />
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
