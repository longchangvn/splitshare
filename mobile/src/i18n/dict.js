// Pure translation layer: shared web catalogue + mobile-only copy.
// No React and no native imports, so node --test can execute it directly.
import { LOCALES, MESSAGES } from './messages.js';
import { EXTRA } from './extra.js';

const DICTS = Object.fromEntries(
  LOCALES.map((code) => [code, { ...(MESSAGES[code] || {}), ...(EXTRA[code] || {}) }]),
);

export function formatMessage(template, vars) {
  if (!vars) return template;
  return String(template).replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{${k}}`));
}

/** Translate a key for a locale; falls back to English, then the key itself. */
export function translateRaw(locale, key, vars) {
  const dict = DICTS[locale] || DICTS.en;
  const raw = dict?.[key] ?? MESSAGES.en?.[key] ?? EXTRA.en?.[key] ?? key;
  return formatMessage(raw, vars);
}

/** All keys for a locale (used by the drift test). */
export function keysOf(locale) {
  return Object.keys(DICTS[locale] || {});
}

export { DICTS, LOCALES, MESSAGES };
