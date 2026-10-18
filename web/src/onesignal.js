// OneSignal Web SDK v16 wrapper. The SDK script is loaded in index.html; init
// runs through window.OneSignalDeferred (the SDK's readiness queue). All calls
// are no-ops when VITE_ONESIGNAL_APP_ID is not configured (e.g. local builds).
//
// Identity: after login we call OneSignal.login(user_id) so subscriptions are
// aliased to the SplitShare user GUID — the API targets pushes by external_id.

const APP_ID = import.meta.env.VITE_ONESIGNAL_APP_ID;

export function onesignalConfigured() {
  return Boolean(APP_ID);
}

function deferred() {
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  return new Promise((resolve) => {
    window.OneSignalDeferred.push(async (OneSignal) => resolve(OneSignal));
  });
}

let ready = null;
export function oneSignal() {
  if (!APP_ID) return Promise.resolve(null);
  if (!ready) ready = deferred();
  return ready;
}

// Single init per page load; every other call waits on it. The SDK throws
// (internal state undefined) if login/logout runs while init is still in
// flight, and auth boot (/me) usually beats script/CDN init — so serialize.
let initDone = null;
export async function initOneSignal() {
  const os = await oneSignal();
  if (!os) return false;
  if (!initDone) {
    initDone = (async () => {
      try {
        await os.init({
          appId: APP_ID,
          // Browsers treat http://localhost as a secure origin; the flag lets web
          // push work on the local dev server (see OneSignal docs).
          allowLocalhostAsSecureOrigin: import.meta.env.DEV,
        });
        return true;
      } catch (err) {
        console.warn('[onesignal] init failed', err);
        return false;
      }
    })();
  }
  return initDone;
}

export async function loginOneSignal(userId) {
  const os = await oneSignal();
  if (!os) return;
  if (!(await initOneSignal())) return; // never call login before init settles
  try {
    await os.login(String(userId));
  } catch (err) {
    console.warn('[onesignal] login failed', err);
  }
}

export async function logoutOneSignal() {
  const os = await oneSignal();
  if (!os) return;
  if (!(await initOneSignal())) return;
  try {
    await os.logout();
  } catch (err) {
    console.warn('[onesignal] logout failed', err);
  }
}

// 'default' | 'granted' | 'denied' | null (null = not configured/supported)
export async function pushPermission() {
  const os = await oneSignal();
  if (!os) return null;
  return os.Notifications.permission;
}

// Explicit user gesture only — never auto-prompt (browsers auto-block repeat prompts).
export async function requestPushPermission() {
  const os = await oneSignal();
  if (!os) return false;
  if (!(await initOneSignal())) return false;
  try {
    await os.Notifications.requestPermission();
    // v16's requestPermission() return value is not a reliable grant indicator
    // (internal early-returns can yield false even on success) — read the real
    // browser permission state instead.
    const native = os.Notifications.permissionNative
      ?? (typeof Notification !== 'undefined' ? Notification.permission : 'default');
    return native === 'granted';
  } catch (err) {
    console.warn('[onesignal] requestPermission failed', err);
    return false;
  }
}
