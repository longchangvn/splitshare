// Pure ExpenseForm logic (web/src/components/Forms.jsx ExpenseForm), kept free of
// React Native imports so it can be unit-tested with node --test.
// Explicit .js extensions so node --test can load this module directly (Metro accepts them too).
import { normalizeDecimalInput as dec } from '../../shared/decimalInput.js';
import { equalPercent } from '../../money.js';

export const SPLIT_TYPES = ['EQUAL', 'EXACT', 'PERCENT', 'SHARES'];
export const MAX_STAGED = 5;

export const todayStr = (date = new Date()) => date.toISOString().slice(0, 10);

/** Per-member split value of a source split row for a given split type. */
export function splitVal(s, type) {
  if (!s) return '';
  if (type === 'EXACT' && s.exact_cents != null) return (s.exact_cents / 100).toString();
  if (type === 'PERCENT' && s.percent != null) return s.percent.toString();
  if (type === 'SHARES' && s.shares != null) return s.shares.toString();
  return '';
}

/** Initial participant ids: edit keeps splits, copy drops former members, create = everyone. */
export function initSel({ existing, copyFrom, members }) {
  const activeIds = new Set(members.map((m) => m.user_id));
  if (existing) return (existing.splits || []).map((s) => s.user_id);
  if (copyFrom) {
    const kept = (copyFrom.splits || []).map((s) => s.user_id).filter((id) => activeIds.has(id));
    return kept.length > 0 ? kept : members.map((m) => m.user_id);
  }
  return members.map((m) => m.user_id);
}

export function initValues(source, type, sel) {
  const out = {};
  if (type === 'SHARES') {
    for (const id of sel) out[id] = '1';
  }
  if (!source || !source.splits) return out;
  for (const s of source.splits) {
    if (!sel.includes(s.user_id)) continue;
    const v = splitVal(s, type);
    if (v !== '') out[s.user_id] = v;
    else if (type === 'SHARES' && !(s.user_id in out)) out[s.user_id] = '1';
  }
  return out;
}

/** Default payer: source payer if still active → me → first member. */
export function initPayer(source, members, meId) {
  const activeIds = new Set(members.map((m) => m.user_id));
  const p = source?.payer_id;
  if (p && activeIds.has(p)) return p;
  if (meId && activeIds.has(meId)) return meId;
  return members[0]?.user_id || '';
}

/** Ids in a copy source that are no longer group members. */
export function droppedMembers(copyFrom, members) {
  if (!copyFrom) return [];
  const activeIds = new Set(members.map((m) => m.user_id));
  return (copyFrom.splits || []).map((s) => s.user_id).filter((id) => !activeIds.has(id));
}

/** Values after switching split type: prefill empty boxes with equal defaults (keeps typed values). */
export function valuesForType(prev, nextType, sel) {
  if (nextType === 'EQUAL') return prev;
  const checked = sel.filter((id) => !(id in prev) || prev[id] === '');
  if (checked.length === 0) return prev;
  const next = { ...prev };
  if (nextType === 'PERCENT') {
    const dist = equalPercent(sel.length);
    sel.forEach((id, i) => { if (checked.includes(id)) next[id] = dist[i]; });
  } else if (nextType === 'SHARES') {
    checked.forEach((id) => { next[id] = '1'; });
  }
  return next;
}

/** Category to select once the group list loads (same fallback chain as web). */
export function pickCategory(list, prev, sourceCategory) {
  if (list.some((c) => c.key === prev)) return prev;
  if (sourceCategory && list.some((c) => c.key === sourceCategory)) return sourceCategory;
  return list.find((c) => c.key === 'food')?.key
    || list.find((c) => c.key === 'other')?.key
    || list[0]?.key
    || prev;
}

/** Request body — identical to web ExpenseForm build(). */
export function buildBody(f) {
  const {
    title, amount, payer, type, sel, values, category, spentAt, onlyPresent,
    tax, tip, fee, origCur, origAmt, fxRate, guests,
  } = f;
  const body = {
    title, amount: Number(amount), payer_id: payer, split_type: type, participant_ids: sel,
    category, spent_at: spentAt ? new Date(`${spentAt}T12:00:00Z`).toISOString() : null,
    only_present: onlyPresent,
  };
  if (tax !== '') body.tax = Number(tax);
  if (tip !== '') body.tip = Number(tip);
  if (fee !== '') body.fee = Number(fee);
  if (origCur.trim() !== '') {
    body.orig_currency = origCur.trim().toUpperCase();
    body.orig_amount = Number(origAmt);
    body.fx_rate = Number(fxRate);
  }
  if (guests.length > 0) {
    body.guests = guests.map((g) => ({
      label: g.label, amount_cents: Math.round(Number(g.amount || 0) * 100), covered_by: g.covered_by,
    }));
  }
  if (type === 'EXACT') {
    body.exact = sel.map((id) => ({ user_id: id, amount_cents: Math.round(Number(values[id] || 0) * 100) }));
  }
  if (type === 'PERCENT') {
    body.percent = sel.map((id) => ({ user_id: id, percent: Number(values[id] || 0) }));
  }
  if (type === 'SHARES') {
    // Empty box means 1 share (avoids 0 -> 422 dead-end).
    body.shares = sel.map((id) => ({
      user_id: id,
      shares: values[id] === '' || values[id] == null ? 1 : Math.max(1, Math.round(Number(values[id] || 1))),
    }));
  }
  return body;
}

/** Local running totals line (server 422 stays authoritative). */
export function runningTotals({ type, sel, values, amount }, t) {
  if (type === 'EQUAL' || sel.length === 0) return null;
  const nums = sel.map((id) => Number(values[id] || 0));
  if (nums.some((n) => Number.isNaN(n))) return null;
  if (type === 'EXACT') {
    const sum = nums.reduce((a, b) => a + b, 0);
    return {
      text: t('forms.expense.totalsExact', { sum: sum.toFixed(2), total: Number(amount || 0).toFixed(2) }),
      ok: Math.abs(sum - Number(amount || 0)) < 0.005,
    };
  }
  if (type === 'PERCENT') {
    const sum = nums.reduce((a, b) => a + b, 0);
    return { text: t('forms.expense.totalsPercent', { sum }), ok: Math.abs(sum - 100) < 1e-9 };
  }
  return { text: t('forms.expense.totalsShares', { sum: nums.reduce((a, b) => a + b, 0) }), ok: true };
}

/** EQUAL explainer: floor + remainder 1¢, who gets +1¢. nameOf(id) → display name. */
export function equalNote(type, preview, { fmtCents, nameOf }, t) {
  if (type !== 'EQUAL' || !preview?.shares) return null;
  const entries = Object.entries(preview.shares);
  if (entries.length === 0) return null;
  const vals = entries.map(([, v]) => v);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const base = fmtCents(lo);
  if (hi === lo) return t('forms.expense.equalNoteOk', { base, count: entries.length });
  const lucky = entries.filter(([, v]) => v === hi).map(([id]) => nameOf(id)).join(', ');
  return t('forms.expense.equalNoteLucky', { base, count: entries.length, lucky });
}

/**
 * Spent-on date check for the text input: YYYY-MM-DD, a real calendar day, not later than
 * tomorrow (UTC slack, same as the batch validateCard rule). Empty is allowed (server default).
 */
export function isValidDay(raw, now = new Date()) {
  const v = String(raw ?? '').trim();
  if (v === '') return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return false;
  return v <= todayStr(new Date(now.getTime() + 24 * 60 * 60 * 1000));
}

/** Decimal-only typing for secondary money fields (tax/tip/fee/fx/guest/split boxes). */
export const decimal = (raw) => dec(raw);

/** Friendly i18n key for a save error code (null → show server message). */
export function saveErrorKey(err) {
  switch (err?.code) {
    case 'STALE_VERSION': return 'm.expense.err.stale';
    case 'EXPENSE_LOCKED': return 'm.expense.err.locked';
    case 'INVOLVES_REMOVED_MEMBER': return 'm.expense.err.removedMember';
    case 'FORBIDDEN': return 'm.expense.err.forbidden';
    default: return null;
  }
}

/**
 * Human-readable lines for one audit entry diff (api ExpenseService: title, description,
 * amount_cents, category, payer, splits {from,to}, deleted). Unknown keys fall back to key: from → to.
 */
export function auditLines(diff, { fmtCents, nameOf, categoryOf }, t) {
  if (!diff || typeof diff !== 'object') return [];
  const lines = [];
  const show = (v) => (v == null || v === '' ? '—' : String(v));
  for (const [key, change] of Object.entries(diff)) {
    if (key === 'deleted') { if (change) lines.push(t('m.expense.audit.deleted')); continue; }
    if (key === 'title' && diff.deleted) continue;
    const from = change?.from;
    const to = change?.to;
    switch (key) {
      case 'title':
        lines.push(`${t('forms.expense.title')}: ${show(from)} → ${show(to)}`); break;
      case 'description':
        lines.push(`${t('m.expense.audit.description')}: ${show(from)} → ${show(to)}`); break;
      case 'amount_cents':
        lines.push(`${t('forms.expense.amount')}: ${fmtCents(from)} → ${fmtCents(to)}`); break;
      case 'category':
        lines.push(`${t('forms.expense.category')}: ${show(categoryOf(from))} → ${show(categoryOf(to))}`); break;
      case 'payer':
        lines.push(`${t('forms.expense.payer')}: ${nameOf(from)} → ${nameOf(to)}`); break;
      case 'splits': {
        const a = from || {};
        const b = to || {};
        const ids = [...new Set([...Object.keys(a), ...Object.keys(b)])];
        const parts = ids
          .filter((id) => a[id] !== b[id])
          .map((id) => `${nameOf(id)} ${a[id] != null ? fmtCents(a[id]) : '—'} → ${b[id] != null ? fmtCents(b[id]) : '—'}`);
        lines.push(`${t('expense.splits')}: ${parts.join(', ') || '—'}`);
        break;
      }
      default:
        if (change && typeof change === 'object' && ('from' in change || 'to' in change)) {
          lines.push(`${key}: ${show(from)} → ${show(to)}`);
        } else {
          lines.push(`${key}: ${typeof change === 'object' ? JSON.stringify(change) : show(change)}`);
        }
    }
  }
  return lines;
}
