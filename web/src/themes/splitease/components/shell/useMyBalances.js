// SplitEase-only: shared read of GET /api/v1/me/balances for the sidebar balance card and the
// Balances / Archived screens. Concurrent callers share one request and a result younger than
// FRESH_MS is reused, so moving between pages does not refetch for every widget.
import { useEffect, useState } from 'react';
import { api, getRefresh } from '../../../../api.js';

const FRESH_MS = 15000;
let cache = null; // { at, session, data } — session guards against reuse after a re-login
let inflight = null;

function fresh() {
  return cache && cache.session === getRefresh() && Date.now() - cache.at < FRESH_MS;
}

function fetchBalances(force = false) {
  if (!force && fresh()) return Promise.resolve(cache.data);
  if (!inflight) {
    const session = getRefresh();
    inflight = api.get('/api/v1/me/balances')
      .then((data) => { cache = { at: Date.now(), session, data }; return data; })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

/** { data, error, loading, reload } — data is the raw /me/balances payload. */
export function useMyBalances({ enabled = true } = {}) {
  const [state, setState] = useState(() => ({
    data: fresh() ? cache.data : null, error: null, loading: enabled && !fresh(),
  }));
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    fetchBalances(nonce > 0)
      .then((data) => { if (live) setState({ data, error: null, loading: false }); })
      .catch((error) => { if (live) setState((s) => ({ ...s, error, loading: false })); });
    return () => { live = false; };
  }, [enabled, nonce]);
  return { ...state, reload: () => setNonce((n) => n + 1) };
}

/** Activity rows (kind, at, text) for each group, newest first, tagged with the group. */
export async function fetchGroupActivity(groups, limit = 20) {
  const lists = await Promise.all((groups || []).map(async (g) => {
    try {
      const rows = await api.get(`/api/v1/groups/${g.group_id}/activity?limit=${limit}`);
      return (rows || []).map((r) => ({ ...r, group_name: g.name, group_id: g.group_id }));
    } catch { return []; }
  }));
  return lists.flat().sort((a, b) => new Date(b.at) - new Date(a.at));
}

/** True when the group still has open member balances (mirrors Dashboard.jsx groupNeedsSettlement). */
export function needsSettlement(group) {
  if (group?.needs_settlement != null) return !!group.needs_settlement;
  return group?.oldest_unsettled_at != null;
}
