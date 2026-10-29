// Push (spec 005 D2/task 5.6) — registers the Expo token with the API so push
// can actually arrive, keeps per-group mute server-side (PATCH /me/devices),
// deletes the device on logout, and routes a tap to its group/expense.
// Old API builds without the feature simply never receive a push; registration
// fails quietly so the app keeps working.
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { api, getTokens } from '../api/client';

const OPT_OUT_KEY = 'ss_push_optout_v1'; // local mirror: { [groupId]: true }
const DEVICE_KEY = 'ss_device_id';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

async function readJson(key, fallback) {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

export async function getOptOuts() {
  return readJson(OPT_OUT_KEY, {});
}

async function writeOptOuts(map) {
  await AsyncStorage.setItem(OPT_OUT_KEY, JSON.stringify(map));
  return map;
}

async function mutedGroupIds() {
  return Object.keys(await getOptOuts());
}

export async function getDeviceId() {
  return AsyncStorage.getItem(DEVICE_KEY);
}

/**
 * Ask for permission, get the Expo token and register it. Re-registering the
 * same token upserts server-side, so calling this on every app start is safe.
 */
export async function registerPush() {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return { status: 'denied' };

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const projectId = (await Notifications.getExpoPushTokenAsync()).data;
    const { at } = await getTokens();
    if (!at) return { status: 'granted', token: projectId, deviceId: null };

    let deviceId = null;
    try {
      const res = await api.post('/api/v1/me/devices', {
        token: projectId,
        platform: Platform.OS === 'android' ? 'android' : 'ios',
        muted_group_ids: await mutedGroupIds(),
      });
      deviceId = res?.device_id || null;
      if (deviceId) await AsyncStorage.setItem(DEVICE_KEY, deviceId);
    } catch {
      // Older API build: keep the local mute list, no server registration.
    }
    return { status: 'granted', token: projectId, deviceId };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

/** Remove this install from the account (called on logout). */
export async function unregisterPush() {
  try {
    const deviceId = await getDeviceId();
    if (deviceId) await api.del(`/api/v1/me/devices/${deviceId}`).catch(() => {});
  } finally {
    await AsyncStorage.removeItem(DEVICE_KEY).catch(() => {});
  }
}

/**
 * Mute/unmute one group: local mirror first (works offline), then the server so
 * this device stops receiving that group's pushes.
 */
export async function setGroupOptOut(groupId, muted) {
  const all = await getOptOuts();
  if (muted) all[groupId] = true;
  else delete all[groupId];
  await writeOptOuts(all);

  const deviceId = await getDeviceId();
  if (deviceId) {
    await api.patch(`/api/v1/me/devices/${deviceId}`, {
      muted_group_ids: Object.keys(all),
    }).catch(() => {});
  }
  return all;
}

export async function isMuted(groupId) {
  return !!(await getOptOuts())[groupId];
}

/** Badge = "you owe something" (never a cross-currency sum — 0 or 1). */
export async function setOwedBadge(oweCents) {
  try {
    await Notifications.setBadgeCountAsync(oweCents > 0 ? 1 : 0);
  } catch { /* simulator */ }
}

/**
 * Route a notification tap: group_id → group, expense ref → expense detail.
 * Returns an unsubscribe function. `onNavigate(name, params)` is supplied by App.
 */
export function addNotificationResponseListener(onNavigate) {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response?.notification?.request?.content?.data || {};
    const groupId = data.group_id;
    const expenseId = data.expense_id;
    if (groupId && expenseId) onNavigate('ExpenseDetail', { groupId, expenseId });
    else if (groupId) onNavigate('GroupDetail', { id: groupId });
    else if (typeof data.url === 'string') {
      // Older payloads only carry the web URL (…/groups/<id>[/…]); route on it.
      const m = data.url.match(/\/groups\/([0-9a-f-]{36})/i);
      if (m) onNavigate('GroupDetail', { id: m[1] });
    }
  });
  return () => sub.remove();
}
