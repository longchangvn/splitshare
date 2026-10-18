// Google's OAuth implicit flow hands the ID token back in the URL *fragment*
// of redirect_uri — our own origin.
//
// Two arrival shapes, and the document Google returns to must tell them apart:
//  - desktop opens a popup (window.open), so `window.opener` is the tab that
//    started the flow and should finish the login;
//  - mobile navigates *this same tab* to Google, so there is no popup. If that
//    tab happens to carry an `opener`, treating it as a popup would ping a
//    stranger and try to close the user's own tab — hence REDIRECT_FLOW_KEY.
//
// The fragment is the authoritative channel (it is the only thing guaranteed to
// survive the round trip). localStorage is purely the cross-tab relay for the
// popup case. Every read therefore falls back from storage to the URL, so a
// blocked or full localStorage can never silently drop the token.

const PENDING_KEY = 'ss_gt';
/** A parked result older than this is ignored rather than replayed. */
const PENDING_TTL_MS = 10 * 60 * 1000;

/** postMessage type used to wake a waiting tab. */
export const PING = 'ss:google';
/** Set by the mobile flow: "this document is the user's tab, not a popup". */
export const REDIRECT_FLOW_KEY = 'ss_gflow';

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

function stripFragment() {
  try { history.replaceState(null, '', window.location.pathname + window.location.search); } catch { /* ignore */ }
}

/** Parse the OAuth response out of the fragment *without* consuming it. */
function peekFragment() {
  const hash = window.location.hash || '';
  if (!hash.includes('id_token=') && !hash.includes('error=')) return null;
  const frag = new URLSearchParams(hash.slice(1));
  const idToken = frag.get('id_token');
  return idToken
    ? { id_token: idToken, next: safePath(frag.get('state')) }
    : { error: frag.get('error'), error_description: frag.get('error_description') };
}

/**
 * Store for the cross-tab relay. Returns false when storage is unavailable
 * (private mode / quota) so the caller can leave the fragment in place —
 * silently swallowing this is what loses the token and bounces the user back
 * to /login with no error at all.
 */
function park(payload) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify({ ...payload, t: Date.now() }));
    return true;
  } catch (err) {
    console.warn('[google] storage refused the token; keeping the URL fragment', err);
    return false;
  }
}

/**
 * Read-and-remove the parked result, falling back to the fragment. Removing on
 * read is what stops several listeners (message, focus, mount) from each
 * consuming the same token and firing two exchanges.
 */
export function takePending() {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (raw) {
      localStorage.removeItem(PENDING_KEY);
      const parsed = JSON.parse(raw);
      if (parsed?.t && Date.now() - parsed.t > PENDING_TTL_MS) {
        console.warn('[google] dropping a stale parked token');
        return null;
      }
      return parsed;
    }
  } catch { /* storage blocked -> fall through to the fragment */ }

  const fromUrl = peekFragment();
  if (fromUrl) {
    stripFragment();
    console.info('[google] recovered the token from the URL fragment');
  }
  return fromUrl;
}

/**
 * Runs once at boot, before React mounts. Acts only when this document is the
 * one Google redirected back to (i.e. the URL fragment carries our response).
 */
export function consumeReturn() {
  const payload = peekFragment();
  if (!payload) return;

  const stored = park(payload);
  // Drop the fragment only once it is safely parked somewhere else; if storage
  // refused it, the fragment stays so the login page can read it from the URL.
  if (stored) stripFragment();

  let opener = null;
  try { opener = window.opener; } catch { /* cross-origin opener */ }

  let redirectFlow = false;
  try {
    redirectFlow = sessionStorage.getItem(REDIRECT_FLOW_KEY) === '1';
    sessionStorage.removeItem(REDIRECT_FLOW_KEY);
  } catch { /* ignore */ }

  console.info('[google] returned from OAuth', {
    token: Boolean(payload.id_token),
    error: payload.error,
    next: payload.next,
    stored,
    opener: Boolean(opener),
    redirectFlow,
  });

  // Hand off to the tab that opened us (desktop popup flow).
  if (!redirectFlow && opener && !opener.closed && stored) {
    const dest = payload.next ? `/login?next=${encodeURIComponent(payload.next)}` : '/login';
    try { opener.postMessage({ type: PING }, window.location.origin); } catch { /* gone */ }
    try { window.close(); } catch { /* some browsers refuse script-close */ }
    // close() refused, so this document is now the consumer — finish here.
    if (!window.closed) window.location.replace(dest);
    return;
  }

  // No popup was involved: this document *is* the tab the user was already on,
  // and it is about to boot the app regardless. Navigating to /login here would
  // hard-reload the page and race the drain — the token gets consumed, the
  // reload lands on /login with nothing parked, and the user is silently sent
  // back to the form with a successful sign-in thrown away. Just hand back and
  // let React mount: the SPA reaches /login client-side and drains there.
  if (stored) return;

  // Storage refused the token, so the fragment is the only copy. Reload onto
  // /login carrying it, where takePending() reads it back from the URL.
  if (payload.next) {
    window.location.replace(`/login?next=${encodeURIComponent(payload.next)}${window.location.hash}`);
  } else {
    window.location.replace(`/login${window.location.hash}`);
  }
}
