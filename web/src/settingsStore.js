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

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { currencies: DEFAULT_CURRENCIES, templates: DEFAULT_TEMPLATES };
    const parsed = JSON.parse(raw);
    return {
      currencies: Array.isArray(parsed.currencies) && parsed.currencies.length
        ? parsed.currencies
        : DEFAULT_CURRENCIES,
      templates: Array.isArray(parsed.templates) && parsed.templates.length
        ? parsed.templates
        : DEFAULT_TEMPLATES,
    };
  } catch {
    return { currencies: DEFAULT_CURRENCIES, templates: DEFAULT_TEMPLATES };
  }
}

function write(next) {
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event('ss-settings-changed'));
}

export function getCatalogs() {
  return read();
}

export function getCurrencies() {
  return read().currencies;
}

export function getTemplates() {
  return read().templates;
}

export function saveCurrency(item) {
  const data = read();
  const code = String(item.code || '').trim().toUpperCase();
  const name = String(item.name || '').trim() || code;
  if (!/^[A-Z]{3}$/.test(code)) throw new Error('Currency code must be 3 letters (e.g. USD).');
  const dup = data.currencies.find((c) => c.code === code && c.id !== item.id);
  if (dup) throw new Error(`${code} already exists.`);
  if (item.id) {
    data.currencies = data.currencies.map((c) => (c.id === item.id ? { ...c, code, name } : c));
  } else {
    data.currencies = [...data.currencies, { id: uid(), code, name }];
  }
  write(data);
  return data.currencies;
}

export function deleteCurrency(id) {
  const data = read();
  if (data.currencies.length <= 1) throw new Error('Keep at least one currency.');
  data.currencies = data.currencies.filter((c) => c.id !== id);
  write(data);
  return data.currencies;
}

export function saveTemplate(item) {
  const data = read();
  const key = String(item.key || '').trim().toLowerCase().replace(/\s+/g, '-');
  const label = String(item.label || '').trim();
  if (!key) throw new Error('Template key is required.');
  if (!label) throw new Error('Template label is required.');
  if (!/^[a-z0-9-]+$/.test(key)) throw new Error('Key must be lowercase letters, numbers, dashes.');
  const dup = data.templates.find((t) => t.key === key && t.id !== item.id);
  if (dup) throw new Error(`Key "${key}" already exists.`);
  if (item.id) {
    data.templates = data.templates.map((t) => (t.id === item.id ? { ...t, key, label } : t));
  } else {
    data.templates = [...data.templates, { id: uid(), key, label }];
  }
  write(data);
  return data.templates;
}

export function deleteTemplate(id) {
  const data = read();
  data.templates = data.templates.filter((t) => t.id !== id);
  write(data);
  return data.templates;
}

export function subscribeCatalogs(listener) {
  const onStorage = (ev) => {
    if (ev.key === KEY || ev.type === 'ss-settings-changed') listener();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener('ss-settings-changed', onStorage);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('ss-settings-changed', onStorage);
  };
}
