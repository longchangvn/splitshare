// Push — invite/expense/payment/settlement + un-settle alert, per-group opt-out, owed badge.
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const OPT_OUT_KEY = 'ss_push_optout_v1'; // { [groupId]: true }

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

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
    const token = (await Notifications.getExpoPushTokenAsync()).data;
    return { status: 'granted', token };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

export async function getOptOuts() {
  try {
    return JSON.parse((await AsyncStorage.getItem(OPT_OUT_KEY)) || '{}');
  } catch {
    return {};
  }
}

export async function setGroupOptOut(groupId, muted) {
  const all = await getOptOuts();
  if (muted) all[groupId] = true;
  else delete all[groupId];
  await AsyncStorage.setItem(OPT_OUT_KEY, JSON.stringify(all));
  return all;
}

export async function isMuted(groupId) {
  return !!(await getOptOuts())[groupId];
}

// Badge = total owed (sum of negative nets across groups, per currency display handled by caller).
export async function setOwedBadge(oweCents) {
  try {
    await Notifications.setBadgeCountAsync(oweCents > 0 ? 1 : 0);
  } catch { /* simulator */ }
}
