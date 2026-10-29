// Verifies every web-parity feature + its endpoints map to a mobile file.
// Run: npm test (node ./scripts/mapping-check.js)
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const checks = [
  // Auth: login/register/google live in AuthContext; screens cover forgot/reset/biometric.
  ['Auth context (login/register/google)', 'src/auth/AuthContext.js', ['/auth/login', '/auth/register', '/auth/google']],
  ['Auth screens (biometric/forgot/reset/google fallback)', 'src/screens/AuthScreen.js', ['/auth/forgot', '/auth/reset', 'LocalAuthentication', 'savedCredentials', 'GoogleToken']],
  ['Home dashboard (my balance, skeleton, recent activity)', 'src/screens/HomeScreen.js', ['SkeletonCard', 'setOwedBadge']],
  ['Balances loader', 'src/components/home/data.js', ['/me/balances', '/activity']],
  ['Groups board', 'src/screens/GroupsScreen.js', ['GroupTile', 'groupStatus.']],
  ['Activity feed', 'src/screens/ActivityScreen.js', ['fetchActivity', 'activityPageTokens']],
  ['Quick add (web QuickAddExpense)', 'src/screens/QuickAddScreen.js', ['resolveQuickAddFlow', 'defaultGroupName', 'mergeMembers']],
  ['New group wizard', 'src/screens/NewGroupScreen.js', ['/groups', '/invites', '/contacts', 'from-template', 'share-link']],
  ['Group detail (tabs + settings + scan entry)', 'src/screens/GroupScreen.js', ['/groups/${id}/me', 'LedgerTab', 'BalancesTab', 'PeopleTab', 'RecurringTab', 'GroupSettingsSheet', 'ScanReceipts']],
  ['Ledger filters + archive scope', 'src/components/group/LedgerTab.js', ["status: 'LOCKED'", 'viewArchive']],
  ['Invite (email/contacts/link)', 'src/screens/InviteScreen.js', ['/invites', '/contacts', '/rotate-invite']],
  ['Add/Edit expense', 'src/components/expense/ExpenseForm.js', ['preview-split', 'preview-edit', 'expected_version', 'queueOrSend', '/categories', 'onSaveNew', 'postScan']],
  ['Receipt helpers (compress + scan + upload)', 'src/receipt.js', ['ImageManipulator', '/expenses/scan', '/images']],
  ['Batch scan receipts', 'src/screens/ScanReceiptsScreen.js', ['cardsFromSuggestion', 'runPool', 'findDuplicates', 'idempotencyKey']],
  ['Expense detail (edit/delete/copy/receipts/comments)', 'src/screens/ExpenseDetailScreen.js', ['EXPENSE_LOCKED', 'AuthImage', '/comments']],
  ['Settlement', 'src/screens/SettlementScreen.js', ['/settlement', 'before_nets', '/settlement/history']],
  ['Pay + reverse + handles', 'src/screens/PayScreen.js', ['/payments', 'OVERPAYMENT', '/reverse', '/handles']],
  ['Statement', 'src/screens/StatementScreen.js', ['/statement/']],
  ['Report', 'src/screens/ReportScreen.js', ['/summary', '/breakdown']],
  ['Offline & notifications', 'src/screens/SystemScreen.js', ['drainQueue', 'registerPush', 'setGroupOptOut']],
  ['Settings (language + templates)', 'src/screens/SettingsScreen.js', ['setLocale', 'saveTemplate']],
  ['Profile (account/password/handles/danger)', 'src/screens/ProfileScreen.js', ['/api/v1/me', '/me/password', '/me/handles', 'HAS_OPEN_BALANCE']],
  ['API client (SecureStore + single-flight refresh)', 'src/api/client.js', ['SecureStore', 'refreshOnce', 'Idempotency-Key', 'getCapabilities']],
  ['Offline queue (AsyncStorage + same key)', 'src/offline/queue.js', ['AsyncStorage', 'idempotencyKey', 'drainQueue']],
  ['Push (notifications + opt-out + badge)', 'src/push/notifications.js', ['registerPush', 'setGroupOptOut', 'setBadgeCountAsync']],
  ['Shared UI', 'src/ui.js', ['Skeleton', 'Sheet', 'toast', 'AuthImage', 'pastelFor']],
  ['i18n (web keys + mobile keys)', 'src/i18n/index.js', ['shared/messages', 'MOBILE_MESSAGES']],
  ['Navigation (dock + FAB + deep links)', 'App.js', ['Join', 'splitshare', 'ExpenseDetail', 'QuickAdd', 'ScanReceipts']],
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
console.log('\nAll features mapped ✓ (web parity)');
