// Locale preference (D4: language only — no theme switch, G-2 light palette).
// Copy comes from the shared web catalogue (generated) plus i18n/extra.js.
// Persisted in AsyncStorage so the choice survives restarts.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LOCALES, LOCALE_META } from './i18n/messages.js';
import { translateRaw } from './i18n/dict.js';

const LOCALE_KEY = 'ss_locale';

const PrefsContext = createContext(null);

export function PrefsProvider({ children }) {
  const [locale, setLocaleState] = useState(null); // null until AsyncStorage answers
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(LOCALE_KEY);
        if (LOCALES.includes(stored)) setLocaleState(stored);
      } catch { /* keep English */ } finally {
        setReady(true);
      }
    })();
  }, []);

  const setLocale = useCallback(async (next) => {
    if (!LOCALES.includes(next)) return;
    setLocaleState(next);
    try { await AsyncStorage.setItem(LOCALE_KEY, next); } catch { /* non-fatal */ }
  }, []);

  const toggleLocale = useCallback(() => {
    setLocale(locale === 'vi' ? 'en' : 'vi');
  }, [locale, setLocale]);

  const t = useCallback((key, vars) => translateRaw(locale || 'en', key, vars), [locale]);

  const value = useMemo(() => ({
    locale: locale || 'en',
    setLocale,
    toggleLocale,
    localeMeta: LOCALE_META[locale || 'en'],
    ready,
    t,
  }), [locale, setLocale, toggleLocale, ready, t]);

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs() {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error('usePrefs must be used within PrefsProvider');
  return ctx;
}

/** Translator hook — `const t = useT(); t('dashboard.myBalance')`. */
export function useT() {
  return usePrefs().t;
}
