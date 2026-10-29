// Verifies every web capability has a mobile screen + endpoint behind it
// (spec 005 parity matrix). Run: npm test
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const checks = [
  ['Foundations: shared money rules', 'src/lib/money.js', ['buildBalance', 'perCurrencyTotals', 'parseMoneyInput', 'signPrefix']],
  ['Foundations: error mapping', 'src/lib/errors.js', ['CODE_KEYS', 'HAS_OPEN_BALANCE', 'EXPENSE_LOCKED', 'INVITE_ROTATED']],
  ['Foundations: i18n catalogue', 'src/i18n/messages.js', ['MESSAGES', 'export const LOCALES']],
  ['Foundations: locale provider', 'src/prefs.jsx', ['PrefsProvider', 'useT', 'AsyncStorage']],
  ['Foundations: UI kit', 'src/ui.js', ['Skeleton', 'SpinButton', 'Sheet', 'Segmented', 'ShareBars', 'Money', 'ErrorBanner']],
  ['Foundations: API client', 'src/api/client.js', ['SecureStore', 'refreshOnce', 'Idempotency-Key', 'imageSource', 'getCached']],
  ['Foundations: read cache', 'src/cache/store.js', ['readCache', 'writeCache', 'isStale']],
  ['Foundations: offline queue', 'src/offline/queue.js', ['AsyncStorage', 'idempotencyKey', 'drainQueue']],
  ['Foundations: push devices', 'src/push/notifications.js', ['registerPush', 'unregisterPush', 'setGroupOptOut', 'setBadgeCountAsync', '/me/devices']],

  ['Auth (login/register/biometric/google/forgot/reset/verify)', 'src/screens/AuthScreen.js', ['/auth/login', '/auth/google', '/auth/forgot', 'resetPassword', 'LocalAuthentication', 'savedCredentials', 'useAuthRequest', 'VerifyEmailScreen']],
  ['Home (per-currency balance, transfers, gauge, updates)', 'src/screens/HomeScreen.js', ['/me/balances', 'buildGlobalActivityQuery', 'buildBalance', 'dashboard.settleIndex', 'm.currency.hint']],
  ['Groups list (lifecycle chips, tiles)', 'src/screens/GroupScreen.js', ['groupStatus', 'GROUP_FILTERS', 'spent_cents', 'needs_settlement']],
  ['Group shell (hero, segments, more sheet, ledger filters)', 'src/screens/GroupScreen.js', ['BalancesTab', 'PeopleTab', 'LedgerFilters', 'buildLedgerQuery', 'moreItems', 'budget']],
  ['Quick add three flows', 'src/screens/QuickAdd.js', ['resolveQuickAddFlow', 'defaultGroupName', '/groups']],
  ['New group wizard + template', 'src/screens/NewGroupScreen.js', ['/groups/from-template', '/invites', '/contacts', 'resolveTemplateKey']],
  ['Add expense (full form)', 'src/screens/AddExpenseScreen.js', ['ExpenseForm', 'ScanReceipts']],
  ['Expense form (payload parity, receipts, scan, save&new)', 'src/components/ExpenseForm.js', ['buildExpensePayload', 'preview-split', 'preview-edit', 'expenses/scan', 'saveNew', 'buildExpensePatch']],
  ['Expense detail (receipts, audit, comments, edit)', 'src/screens/ExpenseDetailScreen.js', ['Comments', 'imageSource', '/images/', 'ExpenseForm']],
  ['Batch receipt scan', 'src/components/ScanReceipts.js', ['MAX_BATCH', 'runPool', 'findDuplicates', 'idempotencyKey', 'validateCard']],
  ['Payment form', 'src/components/PaymentForm.js', ['/handles', '/payments', 'OVERPAYMENT', 'Idempotency-Key']],
  ['Pay + reverse', 'src/screens/PayScreen.js', ['PaymentForm', '/reverse']],
  ['Settlement (why-box, completed, history)', 'src/screens/SettlementScreen.js', ['/settlement', 'before_nets', '/settlement/history', 'reverse']],
  ['Statement', 'src/screens/Statement.js', ['/statement/', 'closing_cents', 'statement.member']],
  ['Report (metrics, bars, categories)', 'src/screens/Report.js', ['/summary', '/breakdown', 'ShareBars', 'report.byCategory']],
  ['Group activity', 'src/screens/GroupActivity.js', ['mergeGroupActivity', '/activity', 'reverse']],
  ['Global activity', 'src/screens/SystemScreen.js', ['/me/activity', 'buildGlobalActivityQuery', 'fanOutGlobalActivity', 'drainQueue']],
  ['Balances tab', 'src/components/BalancesTab.js', ['/nudges', 'groupDetail.whoOwes']],
  ['People tab', 'src/components/PeopleTab.js', ['/members/', 'deposit', 'treasurer']],
  ['Invite hub', 'src/components/InviteSheet.js', ['Clipboard.setStringAsync', 'rotate-invite', '/invites', 'Share.share']],
  ['Group settings', 'src/screens/GroupSettings.js', ['/status', '/leave', '/share-link']],
  ['Categories', 'src/screens/Categories.js', ['/categories', 'is_default']],
  ['Recurring bills', 'src/screens/Recurring.js', ['/recurring', 'frequency']],
  ['Profile (handles, language, danger)', 'src/screens/ProfileScreen.js', ['/me/handles', '/me/password', 'HAS_OPEN_BALANCE', 'setLocale']],
  ['Settings (template catalogue)', 'src/screens/Settings.js', ['getTemplates', 'saveTemplate', 'deleteTemplate']],
  ['Public share + invite landing', 'src/screens/PublicScreens.js', ['/shared/', '/invites/', '/groups/join']],
  ['Deep links', 'App.js', ['splitshare://', 'groups/:id', 's/:token', 'g/:token', 'InviteLanding', 'QuickAdd']],
];

let fail = 0;
for (const [label, file, needles] of checks) {
  const p = path.join(root, file);
  if (!fs.existsSync(p)) { console.error(`MISS file: ${label} -> ${file}`); fail++; continue; }
  const src = fs.readFileSync(p, 'utf8');
  let missing = 0;
  for (const n of needles) {
    if (!src.includes(n)) { console.error(`MISS content: ${label} (${file}) lacks "${n}"`); fail++; missing++; }
  }
  if (missing === 0) console.log(`OK ${label}`);
}
if (fail) { console.error(`\n${fail} mapping gap(s)`); process.exit(1); }
console.log('\nAll web capabilities mapped to mobile screens ✓');
