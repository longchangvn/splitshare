// Locale prefs — mirrors web/src/prefs.jsx (en/vi, same message keys), persisted in
// AsyncStorage. Strings come from shared/messages.js (auto-copied from web) plus a small
// set of mobile-only keys in ./mobileMessages.js.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MESSAGES, LOCALES, LOCALE_META } from '../shared/messages';
import { MOBILE_MESSAGES } from './mobileMessages';

const LOCALE_KEY = 'ss-locale';

const DICTS = Object.fromEntries(LOCALES.map((l) => [l, { ...MESSAGES[l], ...MOBILE_MESSAGES[l] }]));

export function formatMessage(template, vars) {
  if (!vars) return template;
  return String(template).replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{${k}}`));
}

export function translate(locale, key, vars) {
  const raw = (DICTS[locale] || DICTS.en)[key] ?? DICTS.en[key] ?? key;
  return formatMessage(raw, vars);
}

const PrefsContext = createContext({ locale: 'en', setLocale: () => {}, t: (k, v) => translate('en', k, v) });

export function PrefsProvider({ children }) {
  const [locale, setLocaleState] = useState('en');

  useEffect(() => {
    AsyncStorage.getItem(LOCALE_KEY).then((v) => { if (LOCALES.includes(v)) setLocaleState(v); }).catch(() => {});
  }, []);

  const setLocale = useCallback((next) => {
    if (!LOCALES.includes(next)) return;
    setLocaleState(next);
    AsyncStorage.setItem(LOCALE_KEY, next).catch(() => {});
  }, []);

  const t = useCallback((key, vars) => translate(locale, key, vars), [locale]);

  const value = useMemo(() => ({ locale, setLocale, t, locales: LOCALES, localeMeta: LOCALE_META }), [locale, setLocale, t]);
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export const usePrefs = () => useContext(PrefsContext);
export const useT = () => useContext(PrefsContext).t;
