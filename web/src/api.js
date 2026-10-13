// API client. Contract is snake_case both directions (spec §9).
const BASE = import.meta.env.VITE_API_URL || '';

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

export const api = {
  get: (p) => req('GET', p),
  post: (p, b) => req('POST', p, b ?? {}),
  postForm: (p, form) => req('POST', p, undefined, { form }),
  patch: (p, b) => req('PATCH', p, b ?? {}),
  del: (p) => req('DELETE', p),
};

export function fmt(cents, currency) {
  return `${currency} ${(cents / 100).toFixed(2)}`;
}
