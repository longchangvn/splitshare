// Data hooks shared by Home / Groups / Activity (web Dashboard loads
// GET /api/v1/me/balances once and feeds every view from it).
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../../api/client';
import { asList, mergeActivity } from './homeUtils';

/**
 * GET /api/v1/me/balances, reloaded whenever the screen gains focus.
 * Stale responses (an older request finishing after a newer one) are dropped.
 */
export function useBalances({ onData } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const seq = useRef(0);
  const onDataRef = useRef(onData);
  onDataRef.current = onData;

  const load = useCallback(async ({ pull = false } = {}) => {
    const id = ++seq.current;
    if (pull) setRefreshing(true);
    try {
      const d = await api.get('/api/v1/me/balances');
      if (id !== seq.current) return;
      setData(d || { groups: [] });
      setError(null);
      onDataRef.current?.(d);
    } catch (err) {
      if (id === seq.current) setError(err);
    } finally {
      if (id === seq.current) setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return { data, error, refreshing, reload: load, groups: data?.groups || [] };
}

/**
 * Per-group activity merged newest first (web HistoryCard / ActivityFeed).
 * A failing group contributes no rows instead of blanking the whole feed.
 */
export async function fetchActivity(groups, limit) {
  const lists = await Promise.all((groups || []).map(async (g) => {
    try {
      const rows = asList(await api.get(`/api/v1/groups/${g.group_id}/activity?limit=${limit}`), 'items', 'activity');
      return rows.map((r) => ({ ...r, group_name: g.name, group_id: g.group_id }));
    } catch {
      return [];
    }
  }));
  return mergeActivity(lists);
}
