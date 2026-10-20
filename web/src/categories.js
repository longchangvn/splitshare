/** Display label for a group category row from the API. */
export function categoryLabel(cat, t) {
  if (!cat) return '';
  if (cat.is_default) {
    const k = `forms.expense.cat.${cat.key}`;
    const tr = t(k);
    if (tr !== k) return tr;
  }
  return cat.name || cat.key;
}

/** Resolve a stored expense category key against a loaded list. */
export function categoryLabelForKey(key, categories, t) {
  if (!key) return '';
  const hit = (categories || []).find((c) => c.key === key);
  if (hit) return categoryLabel(hit, t);
  const k = `forms.expense.cat.${key}`;
  const tr = t(k);
  return tr !== k ? tr : key;
}

export function categorySelectData(categories, t) {
  return (categories || []).map((c) => ({
    value: c.key,
    label: categoryLabel(c, t),
  }));
}
