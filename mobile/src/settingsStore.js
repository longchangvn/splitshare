// Group template catalog — same shape/rules as web/src/settingsStore.js, but async
// (AsyncStorage instead of localStorage). Device-local, no API.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'ss_settings_catalogs_v1';

const DEFAULT_TEMPLATES = [
  { id: 'roommates', key: 'roommates', label: 'Roommates' },
  { id: 'beach-trip', key: 'beach-trip', label: 'Beach trip' },
  { id: 'wedding', key: 'wedding', label: 'Wedding' },
];

const listeners = new Set();
const uid = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

async function read() {
  try {
    const parsed = JSON.parse((await AsyncStorage.getItem(KEY)) || 'null');
    return { templates: Array.isArray(parsed?.templates) && parsed.templates.length ? parsed.templates : DEFAULT_TEMPLATES };
  } catch {
    return { templates: DEFAULT_TEMPLATES };
  }
}

async function write(next) {
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  listeners.forEach((fn) => fn());
}

export async function getTemplates() {
  return (await read()).templates;
}

/** Throws Error(message) on validation failure (same rules as web). */
export async function saveTemplate(item) {
  const data = await read();
  const key = String(item.key || '').trim().toLowerCase().replace(/\s+/g, '-');
  const label = String(item.label || '').trim();
  if (!key) throw new Error('Template key is required.');
  if (!label) throw new Error('Template label is required.');
  if (!/^[a-z0-9-]+$/.test(key)) throw new Error('Key must be lowercase letters, numbers, dashes.');
  if (data.templates.find((t) => t.key === key && t.id !== item.id)) throw new Error(`Key "${key}" already exists.`);
  data.templates = item.id
    ? data.templates.map((t) => (t.id === item.id ? { ...t, key, label } : t))
    : [...data.templates, { id: uid(), key, label }];
  await write(data);
  return data.templates;
}

export async function deleteTemplate(id) {
  const data = await read();
  data.templates = data.templates.filter((t) => t.id !== id);
  await write(data);
  return data.templates;
}

export function subscribeCatalogs(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
