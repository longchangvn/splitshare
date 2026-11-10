// Auth session — mirrors web/src/auth.jsx Guard + AuthProvider,
// backed by SecureStore (Keychain/Keystore) + biometric unlock.
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { api, setTokens, clearTokens, getTokens, loadApiUrlOverride } from '../api/client';
import { clearSplitMemory } from '../splitMemoryStore';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

// Email sign-ups use the email as username: never show that as a public @handle.
export const publicHandle = (username) => (username && !username.includes('@') ? username : null);

/** Name to show for a user: display name, else email, else public handle. */
export const userLabel = (u) => u?.display_name?.trim() || u?.email || publicHandle(u?.username) || '';

const CRED_USER_KEY = 'ss_cred_user';
const CRED_PW_KEY = 'ss_cred_pw';

export async function savedCredentials() {
  const [u, p] = await Promise.all([
    SecureStore.getItemAsync(CRED_USER_KEY),
    SecureStore.getItemAsync(CRED_PW_KEY),
  ]);
  return u && p ? { username: u, password: p } : null;
}

export async function saveCredentials(username, password) {
  await Promise.all([
    SecureStore.setItemAsync(CRED_USER_KEY, username),
    SecureStore.setItemAsync(CRED_PW_KEY, password),
  ]);
}

export async function clearCredentials() {
  await Promise.all([
    SecureStore.deleteItemAsync(CRED_USER_KEY).catch(() => {}),
    SecureStore.deleteItemAsync(CRED_PW_KEY).catch(() => {}),
  ]);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // Signing in swaps the auth stack for the app stack, dropping the current screen;
  // Root navigates here once the app stack is mounted.
  const postAuthRoute = useRef(null);

  useEffect(() => {
    (async () => {
      await loadApiUrlOverride();
      const { at } = await getTokens();
      if (!at) return setLoading(false);
      try {
        setUser(await api.get('/api/v1/me'));
      } catch {
        // Dead refresh already cleared tokens inside client.
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const saveSession = async (data) => {
    await setTokens(data.access_token, data.refresh_token);
    if (data.user) setUser(data.user);
    else {
      try { setUser(await api.get('/api/v1/me')); } catch { /* ignore */ }
    }
  };

  const value = {
    user,
    loading,
    refreshMe: async () => {
      try { setUser(await api.get('/api/v1/me')); } catch { /* ignore */ }
    },
    setUser,
    /** Save a token-pair response (e.g. invitation accept) and open `route` afterwards. */
    signIn: async (data, route = null) => {
      postAuthRoute.current = route;
      await saveSession(data);
    },
    /** Open `route` after the next sign-in (e.g. come back to an invitation after logging in). */
    setPostAuthRoute: (route) => { postAuthRoute.current = route; },
    takePostAuthRoute: () => {
      const r = postAuthRoute.current;
      postAuthRoute.current = null;
      return r;
    },
    login: async (username_or_email, password, rememberBiometric = true) => {
      const d = await api.post('/api/v1/auth/login', { username_or_email, password });
      await saveSession(d);
      if (rememberBiometric) {
        try { await saveCredentials(username_or_email, password); } catch { /* keychain may be locked */ }
      }
      return d;
    },
    loginWithStored: async (username, password) => {
      const d = await api.post('/api/v1/auth/login', { username_or_email: username, password });
      await saveSession(d);
      return d;
    },
    // Email-only sign-up: payload { email, password }; the email is the username.
    register: async (payload) => {
      const d = await api.post('/api/v1/auth/register', payload);
      await saveSession(d);
      return d; // includes auto_joined_groups
    },
    // Email one-time code: request → { resend_after_seconds }, verify → token pair.
    requestOtp: async (email) => api.post('/api/v1/auth/otp/request', { email }),
    verifyOtp: async (email, code) => {
      const d = await api.post('/api/v1/auth/otp/verify', { email, code });
      await saveSession(d);
      return d;
    },
    google: async (id_token) => {
      const d = await api.post('/api/v1/auth/google', { id_token });
      await saveSession(d);
      return d;
    },
    // Reset returns a fresh token pair, so the app lands signed in (web parity).
    resetPassword: async (token, new_password) => {
      const d = await api.post('/api/v1/auth/reset', { token, new_password });
      await saveSession(d);
      return d;
    },
    verifyEmail: async (token) => api.post('/api/v1/auth/verify-email', { token }),
    // Profile → Verify email: in-app 6-digit code, or a fresh /verify/{token} link.
    requestVerifyCode: async () => api.post('/api/v1/me/verify-email/code'),
    confirmVerifyCode: async (code) => {
      const u = await api.post('/api/v1/me/verify-email/confirm', { code });
      if (u) setUser(u);
      return u;
    },
    sendVerifyLink: async () => api.post('/api/v1/me/verify-email/link'),
    forgot: async (email) => api.post('/api/v1/auth/forgot', { email }),
    logout: async () => {
      const t = await getTokens();
      try {
        if (t.rt) await api.post('/api/v1/auth/logout', { refresh_token: t.rt });
      } finally {
        await clearTokens();
        await clearCredentials();
        await clearSplitMemory();
        setUser(null);
      }
    },
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
