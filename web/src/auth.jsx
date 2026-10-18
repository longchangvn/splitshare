import { createContext, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Center, Loader } from '@mantine/core';
import { api, setTokens, clearTokens, ApiError } from './api.js';
import { loginOneSignal, logoutOneSignal } from './onesignal.js';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!localStorage.getItem('ss_at')) { setLoading(false); return; }
    api.get('/api/v1/me').then(setUser).catch(() => clearTokens()).finally(() => setLoading(false));
  }, []);

  // Link the browser's push subscriptions to this user (external_id) so the
  // API can target them; no-op when OneSignal is not configured.
  useEffect(() => {
    if (user?.user_id) loginOneSignal(user.user_id);
  }, [user?.user_id]);

  const login = async (username_or_email, password) => {
    const d = await api.post('/api/v1/auth/login', { username_or_email, password });
    setTokens(d.access_token, d.refresh_token);
    setUser(d.user);
  };
  const register = async (username, email, display_name, password) => {
    const d = await api.post('/api/v1/auth/register', { username, email, display_name, password });
    setTokens(d.access_token, d.refresh_token);
    setUser(d.user);
    return d;
  };
  const logout = async () => {
    try {
      const rt = localStorage.getItem('ss_rt');
      if (rt) await api.post('/api/v1/auth/logout', { refresh_token: rt });
    } catch { /* already out */ }
    clearTokens();
    setUser(null);
    logoutOneSignal(); // stop targeting this browser's subscriptions
  };
  return <Ctx.Provider value={{ user, loading, login, register, logout, setUser }}>{children}</Ctx.Provider>;
}

export function Guard({ children }) {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  useEffect(() => { if (!loading && !user) nav('/login'); }, [loading, user, nav]);
  if (loading) return <Center h={240}><Loader /></Center>;
  return user ? children : null;
}

export function Err({ e }) {
  if (!e) return null;
  const msg = e instanceof ApiError ? `${e.code || e.status}: ${e.message}` : String(e?.message || e);
  return <Alert color="red" variant="light" title="Something went wrong" mt="sm">{msg}</Alert>;
}
