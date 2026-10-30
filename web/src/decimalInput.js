/**
 * Normalize a typed decimal so `,` works as the decimal separator.
 * Mobile decimal keypads (iOS `inputmode="decimal"`) show `,` instead of `.`
 * in comma locales (vi, fr, de, ...), so "43,22" must mean 43.22.
 * When both separators appear, the last one is the decimal separator.
 */
export function normalizeDecimalInput(raw) {
  const s = String(raw ?? '');
  const comma = s.lastIndexOf(',');
  if (comma === -1) return s;
  if (s.lastIndexOf('.') > comma) return s.replace(/,/g, '');
  return s.replace(/\./g, '').replace(/,/g, '.');
}
