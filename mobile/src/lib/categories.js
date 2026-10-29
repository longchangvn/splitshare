// Category labels — port of web/src/categories.js.
// Default categories are localized through `forms.expense.cat.<key>`; custom
// ones show the group's own name.
export function categoryLabel(cat, t) {
  if (!cat) return '';
  if (cat.is_default) {
    const key = `forms.expense.cat.${cat.key}`;
    const translated = t(key);
    if (translated !== key) return translated;
  }
  return cat.name || cat.key;
}

/** Resolve a stored expense category key against a loaded list. */
export function categoryLabelForKey(key, categories, t) {
  if (!key) return '';
  const hit = (categories || []).find((c) => c.key === key);
  if (hit) return categoryLabel(hit, t);
  const k = `forms.expense.cat.${key}`;
  const translated = t(k);
  return translated !== k ? translated : key;
}

export function categoryOptions(categories, t) {
  return (categories || []).map((c) => ({ value: c.key, label: categoryLabel(c, t) }));
}

/** Key to preselect: keep the current one, else food, else other, else first. */
export function defaultCategoryKey(categories, current) {
  const list = Array.isArray(categories) ? categories : [];
  if (list.some((c) => c.key === current)) return current;
  return list.find((c) => c.key === 'food')?.key
    || list.find((c) => c.key === 'other')?.key
    || list[0]?.key
    || current
    || '';
}
