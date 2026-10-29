// Local catalog store — port of web/src/settingsStore.js onto AsyncStorage
// (spec 005 tasks 1.4/5.3). Same validation messages, same defaults, async API.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'ss_settings_catalogs_v1';

const DEFAULT_CURRENCIES = [
  { id: 'usd', code: 'USD', name: 'US Dollar' },
  { id: 'vnd', code: 'VND', name: 'Vietnamese Dong' },
];

const DEFAULT_TEMPLATES = [
  { id: 'roommates', key: 'roommates', label: 'Roommates' },
  { id: 'beach-trip', key: 'beach-trip', label: 'Beach trip' },
  { id: 'wedding', key: 'wedding', label: 'Wedding' },
];

function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const DEFAULTS = { currencies: DEFAULT_CURRENCIES, templates: DEFAULT_TEMPLATES };

async function read() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { currencies: [...DEFAULT_CURRENCIES], templates: [...DEFAULT_TEMPLATES] };
    const parsed = JSON.parse(raw);
    return {
      currencies: Array.isArray(parsed.currencies) && parsed.currencies.length
        ? parsed.currencies
        : [...DEFAULT_CURRENCIES],
      templates: Array.isArray(parsed.templates) && parsed.templates.length
        ? parsed.templates
        : [...DEFAULT_TEMPLATES],
    };
  } catch {
    return { currencies: [...DEFAULT_CURRENCIES], templates: [...DEFAULT_TEMPLATES] };
  }
}

async function write(next) {
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export async function getCatalogs() {
  return read();
}

export async function getTemplates() {
  return (await read()).templates;
}

export async function saveCurrency(item) {
  const data = await read();
  const code = String(item.code || '').trim().toUpperCase();
  const name = String(item.name || '').trim() || code;
  if (!/^[A-Z]{3}$/.test(code)) throw new Error('Currency code must be 3 letters (e.g. USD).');
  if (data.currencies.find((c) => c.code === code && c.id !== item.id)) {
    throw new Error(`${code} already exists.`);
  }
  data.currencies = item.id
    ? data.currencies.map((c) => (c.id === item.id ? { ...c, code, name } : c))
    : [...data.currencies, { id: uid(), code, name }];
  return (await write(data)).currencies;
}

export async function deleteCurrency(id) {
  const data = await read();
  if (data.currencies.length <= 1) throw new Error('Keep at least one currency.');
  data.currencies = data.currencies.filter((c) => c.id !== id);
  return (await write(data)).currencies;
}

export async function saveTemplate(item) {
  const data = await read();
  const key = String(item.key || '').trim().toLowerCase().replace(/\s+/g, '-');
  const label = String(item.label || '').trim();
  if (!key) throw new Error('Template key is required.');
  if (!label) throw new Error('Template label is required.');
  if (!/^[a-z0-9-]+$/.test(key)) throw new Error('Key must be lowercase letters, numbers, dashes.');
  if (data.templates.find((t) => t.key === key && t.id !== item.id)) {
    throw new Error(`Key "${key}" already exists.`);
  }
  data.templates = item.id
    ? data.templates.map((t) => (t.id === item.id ? { ...t, key, label } : t))
    : [...data.templates, { id: uid(), key, label }];
  return (await write(data)).templates;
}

export async function deleteTemplate(id) {
  const data = await read();
  data.templates = data.templates.filter((t) => t.id !== id);
  return (await write(data)).templates;
}

/**
 * Map the wizard's template field to the key sent to POST /groups/from-template.
 * Label → key, unknown free text passes through, '' when nothing is chosen.
 */
export function resolveTemplateKey(templates, raw, noneLabel) {
  const choice = String(raw ?? '').trim();
  if (!choice || choice === noneLabel) return '';
  return templates.find((x) => x.label === choice)?.key || choice;
}
