// Receipt scan helpers for the Add expense form (specs/004). Pure functions are
// unit-tested in web/test/receipt-scan.test.mjs; compressReceiptImage needs a browser.

export const SCAN_MAX_EDGE = 1200; // px, long edge — totals stay legible at ~160 KB
export const SCAN_QUALITY = 0.6; // JPEG quality 60 %
export const SCAN_DPI = 70; // JFIF density written into the JPEG header
export const SCAN_MOBILE_QUERY = '(max-width: 47.99em)'; // same breakpoint as the mobile layout in styles.css

/** Scale (w, h) to fit inside maxEdge on the long side; never upscales. */
export function fitWithin(width, height, maxEdge = SCAN_MAX_EDGE) {
  const long = Math.max(width, height);
  if (!long || long <= maxEdge) return { width, height };
  const k = maxEdge / long;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

/**
 * Set the JPEG resolution (JFIF APP0 density, units = dots per inch).
 * Updates an existing JFIF header or inserts one after SOI; non-JPEG input is returned as is.
 */
export function setJpegDpi(bytes, dpi = SCAN_DPI) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes;
  const hi = (dpi >> 8) & 0xff;
  const lo = dpi & 0xff;
  const hasJfif = bytes.length >= 18 && bytes[2] === 0xff && bytes[3] === 0xe0
    && String.fromCharCode(bytes[6], bytes[7], bytes[8], bytes[9]) === 'JFIF' && bytes[10] === 0;
  if (hasJfif) {
    const out = bytes.slice();
    out[13] = 1; // units: dots per inch
    out[14] = hi; out[15] = lo; // X density
    out[16] = hi; out[17] = lo; // Y density
    return out;
  }
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, hi, lo, hi, lo, 0x00, 0x00];
  const out = new Uint8Array(bytes.length + app0.length);
  out.set(bytes.subarray(0, 2), 0);
  out.set(app0, 2);
  out.set(bytes.subarray(2), 2 + app0.length);
  return out;
}

/** Read the JFIF DPI back (null when absent / not in dots-per-inch). */
export function readJpegDpi(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 18 || bytes[2] !== 0xff || bytes[3] !== 0xe0) return null;
  if (bytes[13] !== 1) return null;
  return (bytes[14] << 8) | bytes[15];
}

/**
 * Map the API scan response `{ total, confidence, warnings }` to the form amount.
 * The total goes into `amount` as-is (tax/tip stay empty: the API adds them on top).
 */
export function scanToAmount(resp) {
  const warnings = Array.isArray(resp?.warnings) ? resp.warnings : [];
  // Additive API: `receipt.total` is the batch field; older/lean responses keep
  // the flat `total`. Prefer the nested value so both contracts read the same.
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

async function decodeImage(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* fall back to <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Convert RGBA pixels to grayscale and stretch the used range to 0–255. Receipts are
 * black ink on white paper, so the colour channels are wasted bytes; stretching makes
 * faded thermal print and shadows sit at the ends of the range before JPEG encoding.
 * Pure and in-place, so it can be unit-tested without a canvas.
 */
export function grayStretch(data) {
  if (!(data instanceof Uint8ClampedArray) || data.length < 4) return data;
  const count = Math.floor(data.length / 4);
  const gray = new Uint8ClampedArray(count);
  let lo = 255;
  let hi = 0;
  for (let i = 0, g = 0; g < count; i += 4, g++) {
    const v = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
    gray[g] = v;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const span = hi - lo;
  const scale = span > 0 ? 255 / span : 0;
  for (let i = 0, g = 0; g < count; i += 4, g++) {
    const v = scale === 0 ? gray[g] : Math.max(0, Math.min(255, Math.round((gray[g] - lo) * scale)));
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = 255; // JPEG has no alpha; the canvas is already flattened onto white
  }
  return data;
}

/**
 * Browser only: resize to SCAN_MAX_EDGE, flatten to stretched grayscale, then re-encode
 * JPEG at SCAN_QUALITY with SCAN_DPI. A 3024×4032 phone photo (~4 MB) lands near 160 KB,
 * which is enough for OCR to read every total and item line.
 */
export async function compressReceiptImage(file, { maxEdge = SCAN_MAX_EDGE, quality = SCAN_QUALITY, dpi = SCAN_DPI } = {}) {
  const img = await decodeImage(file);
  const srcW = img.width || img.naturalWidth;
  const srcH = img.height || img.naturalHeight;
  const { width, height } = fitWithin(srcW, srcH, maxEdge);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff'; // flatten transparent PNGs
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  img.close?.();
  const pixels = ctx.getImageData(0, 0, width, height);
  grayStretch(pixels.data);
  ctx.putImageData(pixels, 0, 0);
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', quality);
  });
  const bytes = setJpegDpi(new Uint8Array(await blob.arrayBuffer()), dpi);
  return new File([bytes], `receipt-scan-${Date.now()}.jpg`, { type: 'image/jpeg' });
}
