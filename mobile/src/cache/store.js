// Last-good response cache (spec 005 task 0.5). Every read renders instantly
// from here while the network request runs, so Home/Groups never show a blank
// screen offline — only a "stale" hint.
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'ss_cache:';
const DEFAULT_TTL_MS = 5 * 60 * 1000;

function keyFor(path) {
  return PREFIX + String(path || '');
}

export async function readCache(path) {
  try {
    const raw = await AsyncStorage.getItem(keyFor(path));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !('data' in parsed)) return null;
    return { data: parsed.data, savedAt: Number(parsed.savedAt) || 0 };
  } catch {
    return null;
  }
}

export async function writeCache(path, data) {
  try {
    await AsyncStorage.setItem(keyFor(path), JSON.stringify({ data, savedAt: Date.now() }));
  } catch { /* cache is best-effort */ }
}

export async function dropCache(path) {
  try { await AsyncStorage.removeItem(keyFor(path)); } catch { /* ignore */ }
}

/** True when the cached copy is older than `ttlMs` (or has no timestamp). */
export function isStale(entry, ttlMs = DEFAULT_TTL_MS) {
  if (!entry) return true;
  if (!entry.savedAt) return true;
  return Date.now() - entry.savedAt > ttlMs;
}

/** Drop every cached response (logout / account switch). */
export async function clearCache() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const ours = keys.filter((k) => k.startsWith(PREFIX));
    if (ours.length) await AsyncStorage.multiRemove(ours);
  } catch { /* ignore */ }
}
