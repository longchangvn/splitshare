// Live split preview for a draft — same hook as web/src/useSplitPreview.js (specs/007):
// 350 ms after the last change; title edits do not re-preview; late responses are dropped.
import { useEffect, useState } from 'react';
import { api } from './api/client';
import { draftToBody, effectiveAmount } from './shared/expenseDraft';

export function useSplitPreview(draft, url, enabled = true) {
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const ready = enabled && !!url && effectiveAmount(draft) !== null && draft.participantIds.length > 0;
  const { title, ...rest } = draftToBody(draft);
  const sig = ready ? JSON.stringify(rest) : null;

  useEffect(() => {
    if (!sig) { setPreview(null); setError(null); return undefined; }
    let live = true;
    const timer = setTimeout(async () => {
      try {
        const p = await api.post(url, { ...JSON.parse(sig), title });
        if (live) { setPreview(p); setError(null); }
      } catch (err) {
        if (live) { setPreview(null); setError(err); }
      }
    }, 350);
    return () => { live = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, url]);

  return { preview, error };
}
