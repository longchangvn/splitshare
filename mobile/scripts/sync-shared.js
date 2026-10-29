// Copies the web app's pure (no DOM / no JSX) helper modules into mobile/src/shared
// so both clients run the exact same business logic. Web is the source of truth.
//   node ./scripts/sync-shared.js          → write copies
//   node ./scripts/sync-shared.js --check  → exit 1 if any copy drifted (used by npm test)
const fs = require('fs');
const path = require('path');

const mobileRoot = path.join(__dirname, '..');
const webSrc = path.join(mobileRoot, '..', 'web', 'src');
const outDir = path.join(mobileRoot, 'src', 'shared');

const FILES = [
  ['balance.js', 'balance.js'],
  ['breakdown.js', 'breakdown.js'],
  ['categories.js', 'categories.js'],
  ['decimalInput.js', 'decimalInput.js'],
  ['quickAdd.js', 'quickAdd.js'],
  ['receiptBatch.js', 'receiptBatch.js'],
  ['receiptScan.js', 'receiptScan.js'],
  ['wizardUtils.js', 'wizardUtils.js'],
  ['i18n/messages.js', 'messages.js'],
];

const banner = (src) => `// AUTO-COPIED from web/src/${src} by mobile/scripts/sync-shared.js — do not edit here.\n`
  + '// Edit the web file, then run `npm run sync:shared` in mobile/.\n';

const check = process.argv.includes('--check');
if (!fs.existsSync(webSrc)) {
  console.warn(`sync-shared: ${webSrc} not found — skipping (standalone mobile checkout).`);
  process.exit(0);
}
fs.mkdirSync(outDir, { recursive: true });

let drift = 0;
for (const [src, dest] of FILES) {
  const expected = banner(src) + fs.readFileSync(path.join(webSrc, src), 'utf8');
  const target = path.join(outDir, dest);
  const actual = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
  if (actual === expected) { console.log(`OK shared/${dest}`); continue; }
  if (check) { console.error(`DRIFT shared/${dest} differs from web/src/${src} — run npm run sync:shared`); drift++; continue; }
  fs.writeFileSync(target, expected);
  console.log(`WROTE shared/${dest}`);
}
if (drift) process.exit(1);
