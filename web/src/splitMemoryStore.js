// Remembered split storage for web (specs/007): localStorage per user + group.
// Storage failures (private mode, quota) only mean "nothing remembered".
import { SPLIT_MEMORY_PREFIX, parseSplit, snapshotSplit, splitMemoryKey } from './splitMemory.js';

export function loadLastSplit(userId, groupId) {
  if (!userId || !groupId) return null;
  try { return parseSplit(localStorage.getItem(splitMemoryKey(userId, groupId))); } catch { return null; }
}

export function saveLastSplit(userId, groupId, draft) {
  if (!userId || !groupId) return;
  try { localStorage.setItem(splitMemoryKey(userId, groupId), JSON.stringify(snapshotSplit(draft))); } catch { /* ignore */ }
}

/** Logout: forget every remembered split on this device. */
export function clearSplitMemory() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith(SPLIT_MEMORY_PREFIX)) localStorage.removeItem(k);
    }
  } catch { /* ignore */ }
}
