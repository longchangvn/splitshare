// Regenerates mobile/src/i18n/messages.js from the web catalogue so both
// clients share one source of copy (spec 005 task 0.3).
//
//   node scripts/sync-i18n.js           # write the mobile catalogue
//   node scripts/sync-i18n.js --check   # exit 1 when mobile is out of date
//
// The generated file is what the app imports; nothing hand-edits copy on mobile.
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.join(__dirname, '..');
const webFile = path.join(root, '..', 'web', 'src', 'i18n', 'messages.js');
const outFile = path.join(root, 'src', 'i18n', 'messages.js');

const HEADER = [
  '// GENERATED FILE — do not edit.',
  '// Source of truth: web/src/i18n/messages.js (same copy on both clients).',
  '// Regenerate: npm --prefix mobile run sync:i18n',
  '',
].join('\n');

function render({ LOCALES, LOCALE_META, MESSAGES }) {
  const body = [
    `export const LOCALES = ${JSON.stringify(LOCALES)};`,
    '',
    `export const LOCALE_META = ${JSON.stringify(LOCALE_META, null, 2)};`,
    '',
    `export const MESSAGES = ${JSON.stringify(MESSAGES, null, 2)};`,
    '',
    'function formatMessage(template, vars) {',
    '  if (!vars) return template;',
    '  return String(template).replace(/\\{(\\w+)\\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{${k}}`));',
    '}',
    '',
    '/** Translate a key for a locale; falls back to English, then the key itself. */',
    'export function translate(locale, key, vars) {',
    '  const dict = MESSAGES[locale] || MESSAGES.en;',
    '  const raw = dict[key] ?? MESSAGES.en[key] ?? key;',
    '  return formatMessage(raw, vars);',
    '}',
    '',
  ];
  return HEADER + body.join('\n');
}

async function main() {
  if (!fs.existsSync(webFile)) {
    console.error(`MISSING web catalogue: ${webFile}`);
    process.exit(1);
  }
  const mod = await import(pathToFileURL(webFile).href);
  const next = render(mod);
  const current = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8') : '';
  const stale = current !== next;

  if (process.argv.includes('--check')) {
    if (stale) {
      console.error('mobile/src/i18n/messages.js is out of date — run: npm --prefix mobile run sync:i18n');
      const en = Object.keys(mod.MESSAGES.en).length;
      console.error(`web catalogue: ${en} EN keys, ${Object.keys(mod.MESSAGES.vi || {}).length} VI keys`);
      process.exit(1);
    }
    console.log('mobile i18n catalogue matches web ✓');
    return;
  }

  if (!stale) {
    console.log('mobile i18n catalogue already up to date ✓');
    return;
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, next);
  console.log(`wrote ${path.relative(root, outFile)} (${Object.keys(mod.MESSAGES.en).length} EN keys)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
