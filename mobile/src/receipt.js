// Native receipt helpers: pick/capture photos, compress them, and post scans/uploads.
// Native stand-in for web <input type="file"> + compressReceiptImage (web/src/receiptScan.js).
// Native compression only resizes + re-encodes JPEG (no grayscale stretch / JFIF DPI).
//
// On mobile a "file" is a plain object: { uri, name, type, size, width, height }.
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { File as FsFile } from 'expo-file-system';
import { api } from './api/client';
import { SCAN_MAX_EDGE, SCAN_QUALITY, fitWithin } from './shared/receiptScan';
import { MAX_FILE_BYTES } from './shared/receiptBatch';

export { MAX_FILE_BYTES };
export const UPLOAD_MAX_EDGE = 1600; // receipts attached to an expense (readable, small upload)
export const UPLOAD_QUALITY = 0.8;

/** Best-effort byte size of a local file (null when the platform can't tell). */
export function fileSizeOf(uri) {
  try {
    const size = new FsFile(uri).size;
    return typeof size === 'number' && Number.isFinite(size) ? size : null;
  } catch {
    return null;
  }
}

/** Image-picker asset → mobile file object. */
export function fileFromAsset(asset, index = 0) {
  const type = asset?.mimeType || 'image/jpeg';
  const ext = type.split('/')[1] || 'jpg';
  return {
    uri: asset?.uri,
    name: asset?.fileName || `receipt-${Date.now()}-${index}.${ext === 'jpeg' ? 'jpg' : ext}`,
    type,
    size: Number(asset?.fileSize) || fileSizeOf(asset?.uri) || 0,
    width: Number(asset?.width) || 0,
    height: Number(asset?.height) || 0,
  };
}

export const isImageFile = (file) => !file?.type || String(file.type).startsWith('image/');
export const isTooBig = (file) => Number(file?.size || 0) > MAX_FILE_BYTES;

/**
 * Ask camera vs library (native action sheet via Alert). Resolves 'camera' | 'library' | null.
 * labels: { title, camera, library, cancel }
 */
export function chooseSource(labels) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    Alert.alert(labels.title, undefined, [
      { text: labels.camera, onPress: () => finish('camera') },
      { text: labels.library, onPress: () => finish('library') },
      { text: labels.cancel, style: 'cancel', onPress: () => finish(null) },
    ], { cancelable: true, onDismiss: () => finish(null) });
  });
}

/**
 * Open camera or library. Returns { files, denied }. Library supports multi-select up to `limit`;
 * camera always returns at most one photo.
 */
export async function pickImages(source, { multiple = false, limit = 1 } = {}) {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm?.granted) return { files: [], denied: true };
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1, exif: false });
    if (r.canceled) return { files: [], denied: false };
    return { files: (r.assets || []).slice(0, 1).map(fileFromAsset), denied: false };
  }
  const r = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
    exif: false,
    allowsMultipleSelection: multiple && limit > 1,
    selectionLimit: multiple ? Math.max(1, limit) : 1,
  });
  if (r.canceled) return { files: [], denied: false };
  return { files: (r.assets || []).slice(0, Math.max(1, limit)).map(fileFromAsset), denied: false };
}

async function reencode(file, maxEdge, quality, name) {
  const actions = [];
  if (file.width > 0 && file.height > 0) {
    const fit = fitWithin(file.width, file.height, maxEdge);
    if (fit.width !== file.width || fit.height !== file.height) actions.push({ resize: { width: fit.width, height: fit.height } });
  }
  const out = await ImageManipulator.manipulateAsync(file.uri, actions, {
    compress: quality,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return {
    uri: out.uri,
    name,
    type: 'image/jpeg',
    size: fileSizeOf(out.uri) || file.size || 0,
    width: out.width || file.width,
    height: out.height || file.height,
  };
}

const jpgName = (name) => `${String(name || 'receipt').replace(/\.[^.]+$/, '') || 'receipt'}.jpg`;

/** Downscale + JPEG re-encode before attaching to an expense; falls back to the original. */
export async function compressForUpload(file) {
  try {
    return await reencode(file, UPLOAD_MAX_EDGE, UPLOAD_QUALITY, jpgName(file.name));
  } catch {
    return file;
  }
}

/** Scan compression: long edge SCAN_MAX_EDGE, JPEG SCAN_QUALITY. Throws when the image can't be read. */
export function compressForScan(file) {
  return reencode(file, SCAN_MAX_EDGE, SCAN_QUALITY, `receipt-scan-${Date.now()}.jpg`);
}

const part = (file) => ({ uri: file.uri, name: file.name || 'receipt.jpg', type: file.type || 'image/jpeg' });

/** POST /groups/:id/expenses/scan (multipart field `file`). */
export function postScan(groupId, file) {
  const form = new FormData();
  form.append('file', part(file));
  return api.postForm(`/api/v1/groups/${groupId}/expenses/scan`, form);
}

/** POST /expenses/:id/images (multipart field `files`; the API accepts every file part). */
export function uploadImage(expenseId, file) {
  const form = new FormData();
  form.append('files', part(file));
  return api.postForm(`/api/v1/expenses/${expenseId}/images`, form);
}

/** Short display name (keeps start + extension), same as web Forms.jsx shortName. */
export function shortName(name) {
  if (!name || name.length <= 28) return name || '';
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot) : '';
  const base = dot > 0 ? name.slice(0, dot) : name;
  const keep = Math.max(0, 26 - ext.length);
  return `${base.slice(0, Math.min(18, keep))}…${base.slice(-Math.max(0, keep - 18))}${ext}`;
}
