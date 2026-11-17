// Theme registry + runtime selection. The active theme is read from /config.json
// ({ "theme": "<name>" }) before React renders, so switching needs no rebuild:
// edit or mount a different config.json on the server and refresh.
// For local checks, `?theme=<name>` overrides the config for that page load.
// Every theme's CSS is imported here and scoped by `:root[data-theme="<name>"]`.
import classic from './classic/manifest.js';
import splitease from './splitease/manifest.js';
import './classic/theme.css';
import './splitease/theme.css';

export const THEMES = { classic, splitease };
export const DEFAULT_THEME = 'splitease';

let active = THEMES[DEFAULT_THEME];

async function readConfiguredName() {
  const q = new URLSearchParams(window.location.search).get('theme');
  if (q && THEMES[q]) return q;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 2500);
    const res = await fetch('/config.json', { cache: 'no-store', signal: ctl.signal });
    clearTimeout(timer);
    if (res.ok) {
      const name = (await res.json())?.theme;
      if (THEMES[name]) return name;
    }
  } catch { /* missing/slow config → default theme */ }
  return DEFAULT_THEME;
}

function setHeadLink(rel, href, attrs = {}) {
  let el = document.head.querySelector(`link[data-theme-asset="${rel}:${href}"]`);
  if (el) return;
  el = document.createElement('link');
  el.rel = rel;
  el.href = href;
  el.dataset.themeAsset = `${rel}:${href}`;
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  document.head.appendChild(el);
}

export async function loadTheme() {
  active = THEMES[await readConfiguredName()];
  const root = document.documentElement;
  root.setAttribute('data-theme', active.name);
  (active.fonts || []).forEach((href) => setHeadLink('stylesheet', href));
  document.head.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]').forEach((l) => { l.href = active.favicon; });
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', active.themeColor);
  return active;
}

/** The active theme manifest (fixed for the page lifetime once loadTheme resolved). */
export function useAppTheme() {
  return active;
}

export function getAppTheme() {
  return active;
}
