// API client. Contract is snake_case both directions (spec §9).
// Default is same-origin relative URLs: in dev Vite proxies /api to the API
// (see vite.config.js); in prod nginx does the same (see nginx.conf). No CORS.
// Static hosting (Azure Static Web Apps) has no proxy, so its CI build sets
// VITE_API_BASE to the API's absolute origin; calls then go cross-origin and
// the API allows that origin via Cors:AllowedOrigins. Docker builds don't set
// it, so containerized deployments keep the relative-URL behavior above.
const BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/+$/, '');

export function getAccess() { return localStorage.getItem('ss_at'); }
export function getRefresh() { return localStorage.getItem('ss_rt'); }
export function setTokens(at, rt) {
  if (at) localStorage.setItem('ss_at', at); else localStorage.removeItem('ss_at');
  if (rt) localStorage.setItem('ss_rt', rt); else localStorage.removeItem('ss_rt');
}
export function clearTokens() { localStorage.removeItem('ss_at'); localStorage.removeItem('ss_rt'); }

export class ApiError extends Error {
  constructor(status, data) {
    super(data?.message || `HTTP ${status}`);
    this.status = status;
    this.code = data?.code;
    this.fields = data?.fields;
  }
}

async function req(method, path, body, extra = {}) {
  const headers = { ...(extra.headers || {}) };
  let payload;
  if (body !== undefined && !extra.form) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  } else if (extra.form) {
    payload = extra.form; // multipart: browser sets boundary
  }
  if (getAccess()) headers['Authorization'] = `Bearer ${getAccess()}`;
  const r = await fetch(BASE + path, { method, headers, body: payload });
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  if (!r.ok) throw new ApiError(r.status, data);
  return data;
}

// Transparent reactive refresh: on 401 from a non-auth endpoint, run one
// shared refresh for all concurrent callers, store the rotated pair, and
// retry the original request exactly once. Auth paths throw untouched so a
// wrong password never triggers refresh traffic or a retry loop.
let inflightRefresh = null;

async function doRefresh() {
  const rt = getRefresh();
  if (!rt) throw new ApiError(401, { code: 'SESSION_EXPIRED', message: 'Session expired.' });
  const r = await fetch(`${BASE}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: rt }),
  });
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  if (!r.ok) {
    clearTokens();
    throw new ApiError(r.status, { code: 'SESSION_EXPIRED', message: 'Session expired.' });
  }
  setTokens(data.access_token, data.refresh_token);
}

async function reqAuth(method, path, body, extra = {}) {
  try {
    return await req(method, path, body, extra);
  } catch (err) {
    const isAuthPath = path.startsWith('/api/v1/auth/');
    if (!(err instanceof ApiError) || err.status !== 401 || isAuthPath || extra._retried) throw err;
    if (!inflightRefresh) {
      inflightRefresh = doRefresh().finally(() => { inflightRefresh = null; });
    }
    await inflightRefresh;
    return req(method, path, body, { ...extra, _retried: true });
  }
}

// Raw fetch for non-JSON payloads (image blobs, CSV export). Applies the
// same API base as req() — relative /api paths break on Azure Static Web
// Apps, where navigationFallback answers them with index.html at 200.
export async function apiBlob(path, init = {}) {
  const headers = { ...(init.headers || {}) };
  if (getAccess()) headers.Authorization = `Bearer ${getAccess()}`;
  return fetch(BASE + path, { ...init, headers });
}

export const api = {
  get: (p) => reqAuth('GET', p),
  post: (p, b) => reqAuth('POST', p, b ?? {}),
  postForm: (p, form) => reqAuth('POST', p, undefined, { form }),
  patch: (p, b) => reqAuth('PATCH', p, b ?? {}),
  del: (p) => reqAuth('DELETE', p),
};

const CURRENCY_SYMBOL = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  VND: '₫',
};

/** Format cents → money string with grouping. USD → `$1,789.32`. */
export function fmt(cents, currency = 'USD') {
  const code = String(currency || 'USD').toUpperCase();
  const value = Number(cents || 0) / 100;
  const amount = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
  const sym = CURRENCY_SYMBOL[code];
  return sym ? `${sym}${amount}` : `${code} ${amount}`;
}
