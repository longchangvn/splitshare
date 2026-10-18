// Google's OAuth implicit flow hands the ID token back in the URL *fragment*
// of redirect_uri — our own origin. That landing document is a full copy of
// this app, and on mobile it is the only context guaranteed to be awake: the
// tab that started the flow has been backgrounded, and iOS suspends background
// tab timers, so that tab cannot be trusted to poll for the result.
//
// So the returning document hands the outcome back itself. It parks the result
// in localStorage — shared by every tab of this origin — and pings whoever is
// listening. The parked value is the source of truth; the ping only speeds
// things up, so an opener that was suspended, throttled, or replaced still
// finishes the moment it next runs.

const PENDING_KEY = 'ss_gt';

/** postMessage type used to wake a waiting tab. */
export const PING = 'ss:google';

// Same rule as safeNext in AuthPages: an in-app path only, never //host.
const safePath = (v) => (v && v.startsWith('/') && !v.startsWith('//') ? v : null);

/**
 * Opaque nonce for the OAuth request.
 *
 * `Crypto.randomUUID` is [SecureContext]-only, so on an insecure origin — a
 * phone reaching dev over http://192.168.x.x:3000 — it is undefined and the
 * fallback fires. That fallback originally called `.slice(2)` on the *number*
 * returned by Math.random(), throwing "Math.random().slice is not a function"
 * before the button could open anything. localhost is a secure context, so it
 * never reproduced there; only the phone hit it.
 *
 * getRandomValues is available in insecure contexts too, so prefer it, and keep
 * the last-resort branch string-safe. Always returns a non-empty string.
 *
 * cryptoRef is injectable purely so the branches can be exercised without
 * mutating the process-global `crypto`.
 */
export function makeNonce(cryptoRef = (typeof crypto !== 'undefined' ? crypto : null)) {
  if (cryptoRef?.randomUUID) return cryptoRef.randomUUID();
  if (cryptoRef?.getRandomValues) {
    const bytes = new Uint8Array(16);
    cryptoRef.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

function park(payload) {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(payload)); } catch { /* private mode */ }
}

/**
 * Read-and-remove the parked result. Removing on read is what stops several
 * listeners (message, focus, mount) from each consuming the same token and
 * firing two token exchanges.
 */
export function takePending() {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    localStorage.removeItem(PENDING_KEY);
    return JSON.parse(raw);
  } catch { return null; }
}

/**
 * Runs once at boot, before React mounts. Acts only when this document is the
 * one Google redirected back to (i.e. the URL fragment carries our response).
 *
 * Two shapes:
 *  - an opener exists  -> park the result, wake it, close ourselves;
 *  - no opener         -> nobody is waiting, so finish the flow right here by
 *                         loading /login, whose Google button drains the park.
 */
export function consumeReturn() {
  const hash = window.location.hash || '';
  if (!hash.includes('id_token=') && !hash.includes('error=')) return;

  const frag = new URLSearchParams(hash.slice(1));
  const idToken = frag.get('id_token');
  const payload = idToken
    ? { id_token: idToken, next: safePath(frag.get('state')) }
    : { error: frag.get('error'), error_description: frag.get('error_description') };

  park(payload);

  // Strip the fragment so a refresh can never replay a stale token.
  history.replaceState(null, '', window.location.pathname + window.location.search);

  let opener = null;
  try { opener = window.opener; } catch { /* cross-origin opener */ }

  if (opener && !opener.closed) {
    try { opener.postMessage({ type: PING }, window.location.origin); } catch { /* gone */ }
    try { window.close(); } catch { /* some browsers refuse script-close */ }
    // If the browser refused to close us, this document stays on '/' and would
    // render the app unauthenticated — send it to /login anyway, where the
    // button drains the parked result. Whoever reaches the park first wins;
    // the loser recovers via its own wake-up check.
    if (!window.closed) {
      window.location.replace(payload.next ? `/login?next=${encodeURIComponent(payload.next)}` : '/login');
    }
    return;
  }

  window.location.replace(payload.next ? `/login?next=${encodeURIComponent(payload.next)}` : '/login');
}
