// Remembered split storage for mobile (specs/007): AsyncStorage per user + group, with an
// in-memory copy so a Save & new remount reads it instantly. Failures = nothing remembered.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SPLIT_MEMORY_PREFIX, parseSplit, snapshotSplit, splitMemoryKey } from './shared/splitMemory';

const cache = new Map();

export async function loadLastSplit(userId, groupId) {
  if (!userId || !groupId) return null;
  const key = splitMemoryKey(userId, groupId);
  if (cache.has(key)) return cache.get(key);
  try {
    const v = parseSplit(await AsyncStorage.getItem(key));
    cache.set(key, v);
    return v;
  } catch {
    return null;
  }
}

/** Synchronous read of what loadLastSplit / saveLastSplit already cached. */
export function peekLastSplit(userId, groupId) {
  if (!userId || !groupId) return null;
  return cache.get(splitMemoryKey(userId, groupId)) ?? null;
}

export function saveLastSplit(userId, groupId, draft) {
  if (!userId || !groupId) return;
  const key = splitMemoryKey(userId, groupId);
  const snap = snapshotSplit(draft);
  cache.set(key, snap);
  AsyncStorage.setItem(key, JSON.stringify(snap)).catch(() => {});
}

/** Logout: forget every remembered split on this device. */
export async function clearSplitMemory() {
  cache.clear();
  try {
    const keys = await AsyncStorage.getAllKeys();
    const mine = keys.filter((k) => k.startsWith(SPLIT_MEMORY_PREFIX));
    if (mine.length > 0) await AsyncStorage.multiRemove(mine);
  } catch { /* ignore */ }
}
