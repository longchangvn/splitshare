import { createContext, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Center, Loader } from '@mantine/core';
import { api, setTokens, clearTokens, ApiError, onSessionExpired } from './api.js';
import { clearSplitMemory } from './splitMemoryStore.js';
import { useT } from './prefs.jsx';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!localStorage.getItem('ss_at')) { setLoading(false); return; }
    api.get('/api/v1/me').then(setUser).catch(() => clearTokens()).finally(() => setLoading(false));
  }, []);

  useEffect(() => onSessionExpired(() => setUser(null)), []);

  const signedIn = (d) => {
    setTokens(d.access_token, d.refresh_token);
    setUser(d.user);
    return d;
  };
  const login = async (username_or_email, password) =>
    signedIn(await api.post('/api/v1/auth/login', { username_or_email, password }));
  // Email-only sign-up: the email is the username; display name is set later in Profile.
  const register = async (email, password) =>
    signedIn(await api.post('/api/v1/auth/register', { email, password }));
  const requestOtp = (email) => api.post('/api/v1/auth/otp/request', { email });
  const verifyOtp = async (email, code) =>
    signedIn(await api.post('/api/v1/auth/otp/verify', { email, code }));
  const logout = async () => {
    try {
      const rt = localStorage.getItem('ss_rt');
      if (rt) await api.post('/api/v1/auth/logout', { refresh_token: rt });
    } catch { /* already out */ }
    clearTokens();
    clearSplitMemory();
    setUser(null);
  };
  return (
    <Ctx.Provider value={{ user, loading, login, register, requestOtp, verifyOtp, logout, setUser }}>
      {children}
    </Ctx.Provider>
  );
}

// Email sign-ups use the email as username: never show that as a public @handle.
export const publicHandle = (username) => (username && !username.includes('@') ? username : null);

export function Guard({ children }) {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  useEffect(() => { if (!loading && !user) nav('/login', { replace: true }); }, [loading, user, nav]);
  if (loading) return <Center h={240}><Loader /></Center>;
  return user ? children : null;
}

export function Err({ e }) {
  const t = useT();
  if (!e || e.code === 'SESSION_EXPIRED') return null;
  const msg = e instanceof ApiError ? `${e.code || e.status}: ${e.message}` : String(e?.message || e);
  return <Alert color="red" variant="light" title={t('errors.genericTitle')} mt="sm">{msg}</Alert>;
}
