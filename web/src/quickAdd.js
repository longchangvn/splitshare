// Quick "Add expense" picker helpers (specs/003-quick-add-expense).

/** Router state that makes GroupDetail open the New expense form once. */
export const ADD_EXPENSE_STATE = { addExpense: true };

export const GROUP_NAME_MAX = 50;

/**
 * people + group → 'people-and-group' (Flow 1: prefilled New group wizard)
 * group only     → 'group'            (Flow 2: existing add-expense UI)
 * people only    → 'people'           (Flow 3: auto-create group)
 */
export function resolveQuickAddFlow(peopleCount, groupId) {
  if (peopleCount > 0 && groupId) return 'people-and-group';
  if (groupId) return 'group';
  if (peopleCount > 0) return 'people';
  return null;
}

/** Union by user_id (first occurrence wins), never including the current user. */
export function mergeMembers(people = [], groupMembers = [], meId = null) {
  const seen = new Set(meId ? [meId] : []);
  const out = [];
  for (const p of [...people, ...groupMembers]) {
    if (!p?.user_id || seen.has(p.user_id)) continue;
    seen.add(p.user_id);
    out.push({ user_id: p.user_id, display_name: p.display_name, username: p.username });
  }
  return out;
}

/** "You, Ann, Bob" — capped at 50 chars with a "+N" suffix for names that don't fit. */
export function defaultGroupName(people = [], youLabel = 'You', max = GROUP_NAME_MAX) {
  const names = people.map((p) => String(p?.display_name || p?.username || '').trim()).filter(Boolean);
  let name = youLabel;
  for (let i = 0; i < names.length; i += 1) {
    const rest = names.length - i - 1;
    const next = `${name}, ${names[i]}`;
    const suffix = rest > 0 ? ` +${rest}` : '';
    if ((next + suffix).length > max) return `${name} +${names.length - i}`.slice(0, max);
    name = next;
  }
  return name.length >= 3 ? name : `${name} group`;
}
