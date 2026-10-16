// Auth session — mirrors web/src/auth.jsx Guard + AuthProvider,
// but backed by SecureStore (Frame 1: Keychain/Keystore).
import React, { createContext, useContext, useEffect, useState } from 'react';
import { api, setTokens, clearTokens, getTokens } from '../api/client';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

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

  const saveSession = (data) => {
    setTokens(data.access_token, data.refresh_token);
    if (data.user) setUser(data.user);
  };

  const value = {
    user,
    loading,
    login: async (username_or_email, password) => {
      const d = await api.post('/api/v1/auth/login', { username_or_email, password });
      saveSession(d);
      setUser(await api.get('/api/v1/me'));
    },
    register: async (payload) => {
      const d = await api.post('/api/v1/auth/register', payload);
      saveSession(d);
      setUser(await api.get('/api/v1/me'));
      return d; // includes auto_joined_groups
    },
    google: async (id_token) => {
      const d = await api.post('/api/v1/auth/google', { id_token });
      saveSession(d);
      setUser(await api.get('/api/v1/me'));
    },
    logout: async () => {
      const t = await getTokens();
      try {
        if (t.rt) await api.post('/api/v1/auth/logout', { refresh_token: t.rt });
      } finally {
        await clearTokens();
        setUser(null);
      }
    },
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
