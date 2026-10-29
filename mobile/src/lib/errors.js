// Error presentation: API code → human copy, field errors, network vs HTTP.
// Plain JS so node --test can execute it (the translate function is injected).
//
// The API's envelope is { code, message, fields? } (api/Common/ApiErrors.cs).
// The server message is English-only, so the app never shows it directly when
// a known code has localized copy; the raw message stays available for logs.

/** code → i18n key. Keys live in the shared catalogue or i18n/extra.js. */
export const CODE_KEYS = {
  HAS_OPEN_BALANCE: 'm.errors.openBalance',
  OVERPAYMENT: 'm.errors.overpayment',
  STALE_VERSION: 'm.errors.staleVersion',
  EXPENSE_LOCKED: 'm.errors.expenseLocked',
  GROUP_READ_ONLY: 'm.errors.groupReadOnly',
  GROUP_FULL: 'm.errors.groupFull',
  ALREADY_SETTLED: 'm.errors.alreadySettled',
  INVITE_ROTATED: 'm.errors.inviteRotated',
  INVOLVES_REMOVED_MEMBER: 'm.errors.removedMember',
  NUDGE_LIMIT: 'm.errors.nudgeLimit',
  OCR_UNAVAILABLE: 'm.errors.ocrUnavailable',
  OCR_PROVIDER_ERROR: 'm.errors.ocrFailed',
  SESSION_EXPIRED: 'm.errors.session',
  UNAUTH: 'm.errors.session',
  FORBIDDEN: 'm.errors.forbidden',
  NOT_FOUND: 'm.errors.notFound',
  VALIDATION: 'm.errors.validation',
  CONFLICT: 'm.errors.staleVersion',
  RATE_LIMITED: 'm.errors.rateLimited',
};

const STATUS_KEYS = {
  0: 'm.errors.network',
  400: 'm.errors.validation',
  401: 'm.errors.session',
  403: 'm.errors.forbidden',
  404: 'm.errors.notFound',
  409: 'm.errors.staleVersion',
  422: 'm.errors.validation',
  429: 'm.errors.rateLimited',
  500: 'm.errors.server',
  501: 'm.errors.ocrUnavailable',
  502: 'm.errors.server',
  503: 'm.errors.server',
};

/** True when fetch failed before any HTTP response (offline, DNS, CORS). */
export function isNetworkError(err) {
  return !!err && (!err.status || err.status === 0);
}

/** i18n key for any thrown error. */
export function errorKey(err) {
  if (!err) return null;
  if (isNetworkError(err)) return 'm.errors.network';
  if (err.code && CODE_KEYS[err.code]) return CODE_KEYS[err.code];
  if (err.status && STATUS_KEYS[err.status]) return STATUS_KEYS[err.status];
  return 'm.errors.unknown';
}

/**
 * Display text for a thrown error. `t` is the translator from prefs.
 * Known codes win over the server's English message; unknown codes fall back
 * to the server message so a new API code is still readable.
 */
export function errorText(err, t = (k) => k) {
  if (!err) return '';
  if (isNetworkError(err)) return t('m.errors.network');
  // Known API codes always get localized copy, never the English server string.
  if (err.code && CODE_KEYS[err.code]) return t(CODE_KEYS[err.code]);
  // A brand-new server code is still readable through its own message.
  if (err.message) return err.message;
  return t(STATUS_KEYS[err.status] || 'm.errors.unknown');
}

/** Per-field messages from the API's `fields` map, localized where possible. */
export function fieldErrors(err) {
  const fields = err?.fields;
  if (!fields || typeof fields !== 'object') return {};
  const out = {};
  for (const [name, list] of Object.entries(fields)) {
    const arr = Array.isArray(list) ? list : [list];
    out[name] = arr.filter(Boolean).join(' ');
  }
  return out;
}

/** First field error message, for inline summaries. */
export function firstFieldError(err) {
  const all = fieldErrors(err);
  const first = Object.values(all)[0];
  return first || null;
}

/** Field key for money validation reasons from lib/money. */
export const MONEY_FIELD_KEYS = {
  required: 'm.field.required',
  format: 'm.field.amountFormat',
  positive: 'm.field.amountPositive',
  max: 'm.field.amountMax',
};
