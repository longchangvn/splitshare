// AUTO-COPIED from web/src/wizardUtils.js by mobile/scripts/sync-shared.js — do not edit here.
// Edit the web file, then run `npm run sync:shared` in mobile/.
/**
 * Map the New-group wizard's template field value to the key sent to
 * POST /api/v1/groups/from-template.
 *
 * The field is a free-text combobox: the user may pick a catalog label
 * ("Beach trip"), type anything ("Ski trip"), or pick the localized "None"
 * option. Returns '' when no template should be used (empty or the "None"
 * label) so the caller falls back to plain group creation. Catalog labels
 * resolve to their key; unknown free text passes through as-is (the API no
 * longer validates template keys — unknown keys just create a plain group).
 *
 * Plain JS (no JSX) so it can be executed directly by node --test.
 */
export function resolveTemplateKey(templates, raw, noneLabel) {
  const choice = String(raw ?? '').trim();
  if (!choice || choice === noneLabel) return '';
  return templates.find((x) => x.label === choice)?.key || choice;
}
