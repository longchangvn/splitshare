// Verifies every mobile-design frame maps to a screen file + endpoint.
// Run: npm test (node ./scripts/mapping-check.js)
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const checks = [
  ['Frame 1 Auth', 'src/screens/AuthScreen.js', ['/auth/login', '/auth/google', '/auth/forgot']],
  ['Frame 2 Home', 'src/screens/HomeScreen.js', ['/me/balances']],
  ['Frame 3 Group ledger', 'src/screens/GroupScreen.js', ['/groups/${id}/ledger', '/groups/${id}/me']],
  ['Frame 4 Add expense', 'src/screens/AddExpenseScreen.js', ['preview-split', '/expenses']],
  ['Frame 5 Settlement', 'src/screens/SettlementScreen.js', ['/settlement']],
  ['Frame 6 Pay', 'src/screens/PayScreen.js', ['/payments']],
  ['Frame 7 New group', 'src/screens/NewGroupScreen.js', ['/groups', '/invites', '/contacts']],
  ['Frame 8 System', 'src/screens/SystemScreen.js', ['/me']],
  ['API client (SecureStore + single-flight refresh)', 'src/api/client.js', ['SecureStore', 'refreshOnce', 'Idempotency-Key']],
  ['Deep link splitshare://g/<token>', 'App.js', ['Join', 'splitshare']],
];

let fail = 0;
for (const [label, file, needles] of checks) {
  const p = path.join(root, file);
  if (!fs.existsSync(p)) { console.error(`MISS file: ${label} -> ${file}`); fail++; continue; }
  const src = fs.readFileSync(p, 'utf8');
  for (const n of needles) {
    if (!src.includes(n)) { console.error(`MISS content: ${label} (${file}) lacks "${n}"`); fail++; }
    else console.log(`OK ${label}: contains "${n}"`);
  }
}
if (fail) { console.error(`\n${fail} mapping gap(s)`); process.exit(1); }
console.log('\nAll 8 frames mapped 1:1 ✓');
