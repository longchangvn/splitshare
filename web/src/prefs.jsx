import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { MESSAGES, LOCALES, LOCALE_META } from './i18n/messages.js';

const THEME_KEY = 'ss-theme';
const LOCALE_KEY = 'ss-locale';

const PrefsContext = createContext(null);

function readTheme() {
  const v = localStorage.getItem(THEME_KEY);
  return v === 'dark' ? 'dark' : 'light';
}

function readLocale() {
  const v = localStorage.getItem(LOCALE_KEY);
  return LOCALES.includes(v) ? v : 'en';
}

function formatMessage(template, vars) {
  if (!vars) return template;
  return String(template).replace(/\{(\w+)\}/g, (_, k) => (
    vars[k] != null ? String(vars[k]) : `{${k}}`
  ));
}

export function PrefsProvider({ children }) {
  const [theme, setThemeState] = useState(readTheme);
  const [locale, setLocaleState] = useState(readLocale);

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme);
    document.documentElement.setAttribute('data-ss-theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(LOCALE_KEY, locale);
    document.documentElement.lang = locale === 'vi' ? 'vi' : 'en';
  }, [locale]);

  const setTheme = useCallback((next) => {
    setThemeState(next === 'dark' ? 'dark' : 'light');
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  const setLocale = useCallback((next) => {
    if (LOCALES.includes(next)) setLocaleState(next);
  }, []);

  const toggleLocale = useCallback(() => {
    setLocaleState((l) => (l === 'vi' ? 'en' : 'vi'));
  }, []);

  const t = useCallback((key, vars) => {
    const dict = MESSAGES[locale] || MESSAGES.en;
    const raw = dict[key] ?? MESSAGES.en[key] ?? key;
    return formatMessage(raw, vars);
  }, [locale]);

  const value = useMemo(() => ({
    theme,
    setTheme,
    toggleTheme,
    locale,
    setLocale,
    toggleLocale,
    localeMeta: LOCALE_META[locale],
    t,
  }), [theme, setTheme, toggleTheme, locale, setLocale, toggleLocale, t]);

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs() {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error('usePrefs must be used within PrefsProvider');
  return ctx;
}

export function useT() {
  return usePrefs().t;
}
