// Auth session — mirrors web/src/auth.jsx Guard + AuthProvider,
// backed by SecureStore (Keychain/Keystore) + biometric unlock.
import React, { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { api, setTokens, clearTokens, getTokens } from '../api/client';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

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

  useEffect(() => {
    (async () => {
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
    register: async (payload) => {
      const d = await api.post('/api/v1/auth/register', payload);
      await saveSession(d);
      return d; // includes auto_joined_groups
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
    forgot: async (email) => api.post('/api/v1/auth/forgot', { email }),
    logout: async () => {
      const t = await getTokens();
      try {
        if (t.rt) await api.post('/api/v1/auth/logout', { refresh_token: t.rt });
      } finally {
        await clearTokens();
        await clearCredentials();
        setUser(null);
      }
    },
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
