// Receipt scan helpers (spec 005 tasks 3.4/3.5).
// Pure parts mirror web/src/receiptScan.js and are unit-tested; compression uses
// expo-image-manipulator because React Native has no canvas.

export const SCAN_MAX_EDGE = 1200; // px, long edge — totals stay legible around 160 KB
export const SCAN_QUALITY = 0.6; // JPEG quality 60 %

/** Scale (w, h) to fit inside maxEdge on the long side; never upscales. */
export function fitWithin(width, height, maxEdge = SCAN_MAX_EDGE) {
  const long = Math.max(width, height);
  if (!long || long <= maxEdge) return { width, height };
  const k = maxEdge / long;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

/** Map the single-scan response to the form amount (same rules as web). */
export function scanToAmount(resp) {
  const warnings = Array.isArray(resp?.warnings) ? resp.warnings : [];
  const rawTotal = resp?.receipt?.total ?? resp?.total;
  const total = Number(rawTotal);
  const amount = rawTotal != null && Number.isFinite(total) && total > 0 && total <= 1_000_000
    ? total.toFixed(2)
    : null;
  const confidence = resp?.receipt?.confidence?.total ?? resp?.confidence;
  return { amount, lowConfidence: confidence === 'low', warnings };
}

/** i18n key for a failed scan request. */
export function scanErrorKey(err) {
  if (err?.status === 429) return 'forms.expense.scanRateLimited';
  if (err?.status === 501) return 'forms.expense.scanUnavailable';
  return 'forms.expense.scanFailed';
}

/** True when the scan failure is a disabled/absent provider rather than a bad photo. */
export function scanUnavailable(err) {
  return err?.status === 501 || err?.code === 'OCR_UNAVAILABLE';
}

/**
 * Native compress: resize the long edge to SCAN_MAX_EDGE and re-encode JPEG at
 * SCAN_QUALITY. Grayscale stretching (web does it on a canvas) is skipped —
 * expo-image-manipulator has no per-pixel pass — so files land slightly larger
 * but every total stays readable for OCR.
 */
export async function compressReceiptImage(ImageManipulator, asset) {
  const width = asset?.width || 0;
  const height = asset?.height || 0;
  const target = width && height
    ? (width >= height ? { width: fitWithin(width, height).width } : { height: fitWithin(width, height).height })
    : { width: SCAN_MAX_EDGE };
  const result = await ImageManipulator.manipulateAsync(
    asset.uri,
    [{ resize: target }],
    { compress: SCAN_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
  );
  return {
    ...asset,
    uri: result.uri,
    width: result.width,
    height: result.height,
    mimeType: 'image/jpeg',
    fileName: asset.fileName || `receipt-scan-${Date.now()}.jpg`,
  };
}
