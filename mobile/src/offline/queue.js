// Offline queue stub (Frame 8: "Offline queue (2) AUTO-SYNC").
// V1 scope per approval: scaffold + stub; full sync worker lands next.
// Contract: same Idempotency-Key is REUSED on retry so the server replays
// the original response instead of double-counting (IdempotencyService.cs).
// REQ §10-11: offline draft expense/payment queue with auto-sync, no duplicate.
import { newIdempotencyKey } from '../api/client';

export function createDraft(type, payload) {
  return {
    key: newIdempotencyKey(), // stable across retries
    type, // 'expense' | 'payment'
    payload,
    createdAt: new Date().toISOString(),
    status: 'queued',
  };
}

// TODO(V1-next): persist to AsyncStorage, drain on reconnect via NetInfo,
// POST with { idempotencyKey: draft.key }. Do NOT regenerate the key.
export const drainQueue = async () => ({ drained: 0, note: 'stub — online-only V1' });
