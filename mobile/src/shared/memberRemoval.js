// AUTO-COPIED from web/src/memberRemoval.js by mobile/scripts/sync-shared.js — do not edit here.
// Edit the web file, then run `npm run sync:shared` in mobile/.
// Member removal with re-split (pure; synced to mobile). The server previews the
// removal: settled members are removed as-is; otherwise each open expense they
// share in is re-split among the remaining participants by its own split method.

export const removalPreviewPath = (groupId, userId) =>
  `/api/v1/groups/${groupId}/members/${userId}/removal-preview`;

/** Older API builds have no preview route: they 404 with no error code. */
export const isMissingPreviewRoute = (err) => err?.status === 404 && !err?.code;

/** Stand-in preview for older APIs: plain removal, server still requires a settled balance. */
export const LEGACY_PREVIEW = Object.freeze({ legacy: true, can_remove: true });

/** Fetch the preview, falling back to LEGACY_PREVIEW when the API predates it. */
export async function fetchRemovalPreview(get, groupId, userId) {
  try {
    return await get(removalPreviewPath(groupId, userId));
  } catch (err) {
    if (isMissingPreviewRoute(err)) return LEGACY_PREVIEW;
    throw err;
  }
}

export const removalPath = (groupId, userId, preview) => {
  const base = `/api/v1/groups/${groupId}/members/${userId}`;
  if (preview?.legacy) return base;
  const hash = preview?.inputs_hash;
  return `${base}?strategy=resplit${hash ? `&expected_hash=${encodeURIComponent(hash)}` : ''}`;
};

/** Ledger moved since the preview: keep the confirm open and reload the preview. */
export const isStaleRemoval = (err) => err?.code === 'STALE_LEDGER';

/**
 * @param {object|null} preview  GET removal-preview body.
 * @param {(id:string)=>string} nameOf
 * @returns {{mode:'loading'|'legacy'|'settled'|'resplit'|'blocked', blockers:string[],
 *   expenses:Array<{id:string,title:string,method:string,amountCents:number,
 *   rows:Array<{userId:string,name:string,fromCents:number,toCents:number}>}>}}
 */
export function removalSummary(preview, nameOf = (id) => id) {
  if (!preview) return { mode: 'loading', blockers: [], expenses: [] };
  if (preview.legacy) return { mode: 'legacy', blockers: [], expenses: [] };
  const blockers = Array.isArray(preview.blockers) ? preview.blockers : [];
  const expenses = (Array.isArray(preview.expenses) ? preview.expenses : []).map((x) => {
    const from = x.from || {};
    const to = x.to || {};
    return {
      id: x.expense_id,
      title: x.title,
      method: String(x.split_type || 'equal').toLowerCase(),
      amountCents: Number(x.amount_cents) || 0,
      rows: Object.keys(to).sort((a, b) => String(nameOf(a)).localeCompare(String(nameOf(b))))
        .map((u) => ({ userId: u, name: nameOf(u), fromCents: Number(from[u]) || 0, toCents: Number(to[u]) || 0 })),
    };
  });
  const mode = !preview.can_remove ? 'blocked' : expenses.length ? 'resplit' : 'settled';
  return { mode, blockers, expenses };
}
