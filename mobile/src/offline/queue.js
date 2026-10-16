// Offline queue — V1 REQ §10: offline draft expense/payment queue with auto-sync.
// Contract: same Idempotency-Key REUSED on retry so server replays instead of double-counting.
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { api, newIdempotencyKey } from '../api/client';

const QUEUE_KEY = 'ss_offline_queue_v1';

export function createDraft(type, payload, groupId) {
  return {
    key: newIdempotencyKey(), // stable across retries — never regenerate
    type, // 'expense' | 'payment'
    group_id: groupId,
    payload,
    created_at: new Date().toISOString(),
    status: 'queued',
  };
}

export async function enqueueDraft(draft) {
  const q = await getQueue();
  q.push(draft);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  return draft;
}

export async function getQueue() {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function removeDraft(key) {
  const q = (await getQueue()).filter((d) => d.key !== key);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

export async function queueOrSend(type, groupId, sendFn, payload) {
  const net = await NetInfo.fetch().catch(() => ({ isConnected: true }));
  if (net.isConnected) {
    return sendFn(); // online: direct send with fresh idempotency key
  }
  const draft = createDraft(type, payload, groupId);
  await enqueueDraft(draft);
  return { queued: true, draft };
}

// Drain on reconnect: POST each draft with its ORIGINAL key.
export async function drainQueue(onProgress) {
  const net = await NetInfo.fetch().catch(() => ({ isConnected: true }));
  if (!net.isConnected) return { drained: 0, remaining: (await getQueue()).length, offline: true };
  const q = await getQueue();
  let drained = 0;
  const errors = [];
  for (const d of q) {
    try {
      if (d.type === 'expense') {
        await api.post(`/api/v1/groups/${d.group_id}/expenses`, d.payload, { idempotencyKey: d.key });
      } else if (d.type === 'payment') {
        await api.post(`/api/v1/groups/${d.group_id}/payments`, d.payload, { idempotencyKey: d.key });
      }
      await removeDraft(d.key);
      drained += 1;
      onProgress?.(drained);
    } catch (e) {
      // 4xx validation: drop poison drafts so queue doesn't wedge; 5xx/network: keep.
      if (e.status >= 400 && e.status < 500) {
        await removeDraft(d.key);
        errors.push(`${d.type}: ${e.code}`);
      } else {
        errors.push(`${d.type}: network`);
        break;
      }
    }
  }
  return { drained, remaining: (await getQueue()).length, errors };
}

export function subscribeReconnect(onReconnect) {
  return NetInfo.addEventListener((state) => {
    if (state.isConnected) onReconnect?.();
  });
}
