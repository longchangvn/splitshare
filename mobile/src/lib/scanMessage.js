// UI copy for a receipt scan result (kept out of the component so it is
// testable and shared by the single-scan button).
export { scanToAmount, scanErrorKey, scanUnavailable } from './receiptScan.js';

/**
 * Message to show after a scan, or null when nothing needs saying.
 * Reuses the web catalogue's expense-scan copy.
 */
export function scannerMessage(t, { scanned, lowConfidence }) {
  if (!scanned) return t('forms.expense.scanNoTotal');
  if (lowConfidence) return t('forms.expense.scanLowConfidence');
  return t('forms.expense.scanCheck');
}
