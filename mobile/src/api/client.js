// API client — 1:1 with api/ (Bearer + single-flight refresh).
// Base: /api/v1, snake_case both directions, errors {code, message, fields?}.
//
// Backend quirks (verified against api/Endpoints/*.cs):
// - Preview-split is GROUP-SCOPED: POST /groups/:id/expenses/preview-split
// - Un-settle preview for edits: POST /expenses/:id/preview-edit
// - Images: authenticated GET /images/:id binary; upload POST /expenses/:id/images multipart
// - Idempotency-Key OPTIONAL server-side; client ALWAYS sends it on expenses/payments.
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import uuid from 'react-native-uuid';

const AT_KEY = 'ss_at';
const RT_KEY = 'ss_rt';

function isLoopback(hostname) {
  return !hostname || hostname === 'localhost' || hostname === '127.0.0.1';
}

function packagerLanHost() {
  const hostUri = Constants.expoConfig?.hostUri || '';
  const ip = String(hostUri).match(/(\d+\.\d+\.\d+\.\d+)/);
  if (ip) return ip[1];
  try {
    const u = new URL(hostUri.includes('://') ? hostUri : `http://${hostUri}`);
    if (!isLoopback(u.hostname)) return u.hostname;
  } catch { /* ignore */ }
  return null;
}

export function baseUrl() {
  const configured = (
    Constants?.expoConfig?.extra?.apiUrl ||
    process.env.EXPO_PUBLIC_API_URL ||
    'http://localhost:8081'
  ).replace(/\/+$/, '');

  let parsed;
  try { parsed = new URL(configured); } catch { parsed = null; }
  const port = parsed?.port || '8081';
  const proto = parsed?.protocol || 'http:';
  const host = parsed?.hostname || 'localhost';

  const lan = packagerLanHost();
  if (lan && isLoopback(host)) return `${proto}//${lan}:${port}`;
  if (Platform.OS === 'android' && isLoopback(host)) return `${proto}//10.0.2.2:${port}`;
  return configured;
}

export class ApiError extends Error {
  constructor(status, code, message, fields) {
    super(message || code || `HTTP ${status}`);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export async function getTokens() {
  const [at, rt] = await Promise.all([
    SecureStore.getItemAsync(AT_KEY),
    SecureStore.getItemAsync(RT_KEY),
  ]);
  return { at, rt };
}

export async function setTokens(at, rt) {
  await Promise.all([
    at
      ? SecureStore.setItemAsync(AT_KEY, at)
      : SecureStore.deleteItemAsync(AT_KEY),
    rt
      ? SecureStore.setItemAsync(RT_KEY, rt)
      : SecureStore.deleteItemAsync(RT_KEY),
  ]);
}

export async function clearTokens() {
  await Promise.all([
    SecureStore.deleteItemAsync(AT_KEY).catch(() => {}),
    SecureStore.deleteItemAsync(RT_KEY).catch(() => {}),
  ]);
}

export function newIdempotencyKey() {
  return uuid.v4();
}

// Single-flight refresh: N concurrent 401s -> exactly 1 refresh.
let refreshPromise = null;
async function refreshOnce() {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const { rt } = await getTokens();
      if (!rt) throw new ApiError(401, 'UNAUTH', 'No refresh token');
      const r = await fetch(`${baseUrl()}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: rt }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        await clearTokens();
        throw new ApiError(r.status, data.code || 'UNAUTH', data.message);
      }
      await setTokens(data.access_token, data.refresh_token);
      return data.access_token;
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function request(method, path, { body, form, idempotencyKey, retry = true } = {}) {
  const { at } = await getTokens();
  const headers = {};
  if (at) headers.Authorization = `Bearer ${at}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const r = await fetch(`${baseUrl()}${path}`, {
    method,
    headers,
    body: form || (body !== undefined ? JSON.stringify(body) : undefined),
  });

  const isAuthPath = path.includes('/auth/');
  if (r.status === 401 && retry && !isAuthPath) {
    const fresh = await refreshOnce().catch(() => null);
    if (fresh) return request(method, path, { body, form, idempotencyKey, retry: false });
    throw new ApiError(401, 'SESSION_EXPIRED', 'Session expired');
  }

  if (r.status === 204) return null;
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('json') ? await r.json().catch(() => ({})) : await r.text();
  if (!r.ok) {
    throw new ApiError(r.status, data?.code || 'INTERNAL', data?.message, data?.fields);
  }
  return data;
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, body, opts) => request('POST', p, { body, ...opts }),
  patch: (p, body) => request('PATCH', p, { body }),
  del: (p) => request('DELETE', p),
  postForm: (p, formData, opts) => request('POST', p, { form: formData, ...opts }),
  getBlob: async (p) => {
    const { at } = await getTokens();
    const r = await fetch(`${baseUrl()}${p}`, {
      headers: at ? { Authorization: `Bearer ${at}` } : {},
    });
    if (!r.ok) throw new ApiError(r.status, 'NOT_FOUND', 'Download failed');
    return r.blob();
  },
  // Authenticated image URI for <Image source>: RN Image can't set headers,
  // so download to blob + object URL where supported, else caller uses fetch.
  imageUrl: (imageId) => `${baseUrl()}/api/v1/images/${imageId}`,
};

// Server returns snake_case; normalize common id aliases.
export function groupIdOf(g) {
  return g?.group_id || g?.group?.group_id || g?.group?.id || g?.id;
}
export function expenseIdOf(e) {
  return e?.expense?.expense_id || e?.expense_id || e?.id;
}

// iOS decimal-pad shows `,` instead of `.` in comma locales (vi, fr, de, ...):
// treat the last separator typed as the decimal point.
export function normalizeDecimal(raw) {
  const s = String(raw ?? '');
  const comma = s.lastIndexOf(',');
  if (comma === -1) return s;
  if (s.lastIndexOf('.') > comma) return s.replace(/,/g, '');
  return s.replace(/\./g, '').replace(/,/g, '.');
}

export const fmt = (cents, currency = 'USD') =>
  `${currency} ${(cents / 100).toFixed(2)}`;

export const displayNameOf = (members, id) =>
  members?.find((m) => (m.user_id || m.id) === id)?.display_name ||
  members?.find((m) => (m.user_id || m.id) === id)?.username ||
  String(id || '').slice(0, 8);
