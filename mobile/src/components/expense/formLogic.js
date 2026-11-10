// Mobile-only ExpenseForm helpers. The draft model, split rules, body builder and
// validator are shared with web (src/shared/expenseDraft.js, specs/007) and re-exported
// here so existing imports keep working.
// Explicit .js extensions so node --test can load this module directly (Metro accepts them too).
import { normalizeDecimalInput as dec } from '../../shared/decimalInput.js';
import { draftToBody, runningTotals as draftTotals } from '../../shared/expenseDraft.js';

export {
  SPLIT_TYPES, splitVal, initSel, initValues, initPayer, droppedMembers, valuesForType,
  pickCategory, equalNote, isValidDay,
} from '../../shared/expenseDraft.js';

export const MAX_STAGED = 5;

export const todayStr = (date = new Date()) => date.toISOString().slice(0, 10);

/** Legacy field names (payer/type/sel/origCur/origAmt) → shared draft fields. */
const toDraft = (f) => ({
  ...f,
  payerId: f.payer,
  splitType: f.type,
  participantIds: f.sel,
  origCurrency: f.origCur ?? '',
  origAmount: f.origAmt ?? '',
});

/** Request body — the shared draftToBody (same as web and the scan cards). */
export const buildBody = (f) => draftToBody(toDraft(f));

/** Local running totals line (server 422 stays authoritative). */
export const runningTotals = (f, t) => draftTotals(toDraft({ tax: '', tip: '', fee: '', ...f }), t);

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
