// Verifies every mobile-design frame + V1 endpoints map to a screen file.
// Run: npm test (node ./scripts/mapping-check.js)
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const checks = [
  ['Frame 1 Auth (login/register/biometric/google/forgot/reset)', 'src/screens/AuthScreen.js', ['/auth/login', '/auth/google', '/auth/forgot', '/auth/reset', 'LocalAuthentication', 'savedCredentials']],
  ['Frame 2 Home (balances by currency, skeleton, whole-card)', 'src/screens/HomeScreen.js', ['/me/balances', 'SkeletonCard', 'delinquent']],
  ['Frame 3 Group ledger + members + invite + settings', 'src/screens/GroupScreen.js', ['/ledger', '/groups/${id}/me', 'InviteSheet', 'Group settings']],
  ['Frame 4 Add expense (preview-split, idempotency, compress)', 'src/screens/AddExpenseScreen.js', ['preview-split', '/expenses', 'Idempotency', 'ImageManipulator']],
  ['Frame 4b Expense detail (edit/preview-edit/delete/copy)', 'src/screens/ExpenseDetailScreen.js', ['preview-edit', 'expected_version', 'STALE_VERSION', 'EXPENSE_LOCKED']],
  ['Frame 5 Settlement Why-box', 'src/screens/SettlementScreen.js', ['/settlement', 'before_nets', 'History']],
  ['Frame 6 Pay + reverse', 'src/screens/PayScreen.js', ['/payments', 'OVERPAYMENT', '/reverse']],
  ['Frame 7 New group wizard', 'src/screens/NewGroupScreen.js', ['/groups', '/invites', '/contacts']],
  ['Frame 8a Activity (offline queue + push)', 'src/screens/SystemScreen.js', ['drainQueue', 'registerPush', 'setGroupOptOut']],
  ['Frame 8b Profile', 'src/screens/ProfileScreen.js', ['/api/v1/me', '/me/password', 'HAS_OPEN_BALANCE']],
  ['API client (SecureStore + single-flight refresh)', 'src/api/client.js', ['SecureStore', 'refreshOnce', 'Idempotency-Key']],
  ['Offline queue (AsyncStorage + same key)', 'src/offline/queue.js', ['AsyncStorage', 'idempotencyKey', 'drainQueue']],
  ['Push (notifications + opt-out + badge)', 'src/push/notifications.js', ['registerPush', 'setGroupOptOut', 'setBadgeCountAsync']],
  ['UX polish shared UI', 'src/ui.js', ['Skeleton', 'SpinButton', 'NetBadge']],
  ['Deep link splitshare://g/<token>', 'App.js', ['Join', 'splitshare', 'ExpenseDetail']],
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
console.log('\nAll frames mapped 1:1 ✓ (V1 + UX polish, trip-pack excluded)');
