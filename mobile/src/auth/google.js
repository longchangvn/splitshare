// Native Google sign-in (expo-auth-session, authorization code + PKCE → ID token),
// handed to POST /auth/google like the web flow. Client IDs come from app.json
// `extra` (googleIosClientId / googleAndroidClientId / googleClientId) or
// EXPO_PUBLIC_GOOGLE_*_CLIENT_ID. The API must list the native client IDs in
// Auth:GoogleExtraClientIds so their ID tokens pass audience validation.
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';

WebBrowser.maybeCompleteAuthSession();

export function googleClientIds() {
  const x = Constants?.expoConfig?.extra || {};
  return {
    iosClientId: x.googleIosClientId || process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || undefined,
    androidClientId: x.googleAndroidClientId || process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || undefined,
    webClientId: x.googleClientId || process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || undefined,
  };
}

/**
 * True when this build can run the native flow: the platform's client ID is set and
 * we are not inside Expo Go (it cannot receive the `<bundle id>:/oauthredirect` redirect).
 */
export function nativeGoogleAvailable() {
  const ids = googleClientIds();
  const id = Platform.select({ ios: ids.iosClientId, android: ids.androidClientId, default: ids.webClientId });
  return Boolean(id) && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
}

/**
 * Only call from a component rendered when nativeGoogleAvailable() is true — the
 * provider hook throws without the platform client ID.
 * onIdToken(idToken) on success; onError(message|null) — null means cancelled.
 */
export function useGoogleIdToken({ loginHint, onIdToken, onError }) {
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    ...googleClientIds(), loginHint, selectAccount: true,
  });
  const cb = useRef({ onIdToken, onError });
  cb.current = { onIdToken, onError };
  useEffect(() => {
    if (!response) return;
    if (response.type === 'success') {
      const tok = response.params?.id_token || response.authentication?.idToken;
      if (tok) cb.current.onIdToken(tok);
      // A success without a token yet is the code awaiting exchange; the hook re-emits.
      else if (!response.params?.code) cb.current.onError('Google did not return an ID token.');
    } else if (response.type === 'error') {
      cb.current.onError(response.error?.message || response.params?.error_description || response.params?.error || 'Google sign-in failed.');
    } else {
      cb.current.onError(null);
    }
  }, [response]);
  return { ready: Boolean(request), start: () => promptAsync() };
}
