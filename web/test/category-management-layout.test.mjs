import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router-dom';
import { build } from 'esbuild';

globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

const bundleDir = await mkdtemp(join(new URL('..', import.meta.url).pathname, '.category-test-'));
const groupBundlePath = join(bundleDir, 'group-detail.mjs');
await build({
  entryPoints: [new URL('../src/pages/GroupDetail.jsx', import.meta.url).pathname],
  bundle: true,
  format: 'esm',
  platform: 'node',
  packages: 'external',
  jsx: 'automatic',
  define: { 'import.meta.env.VITE_API_BASE': '""' },
  outfile: groupBundlePath,
});
const { BalancesPanel, CategoryManager, RecurringForm, RecurringRuleList, formatGroupCreatedAt, formatRecurringAmount } = await import(pathToFileURL(groupBundlePath).href);
await build({
  entryPoints: [
    new URL('../src/pages/Report.jsx', import.meta.url).pathname,
    new URL('../src/pages/Statement.jsx', import.meta.url).pathname,
    new URL('../src/components/MoneyCharts.jsx', import.meta.url).pathname,
    new URL('../src/auth.jsx', import.meta.url).pathname,
    new URL('../src/prefs.jsx', import.meta.url).pathname,
  ],
  bundle: true,
  format: 'esm',
  platform: 'node',
  packages: 'external',
  jsx: 'automatic',
  define: { 'import.meta.env.VITE_API_BASE': '""' },
  outbase: new URL('../src', import.meta.url).pathname,
  outdir: bundleDir,
  entryNames: '[dir]/[name]',
  splitting: true,
});
const { ReportPanel } = await import(pathToFileURL(join(bundleDir, 'pages/Report.js')).href);
const { StatementMobileList } = await import(pathToFileURL(join(bundleDir, 'pages/Statement.js')).href);
const { MoneyDonut } = await import(pathToFileURL(join(bundleDir, 'components/MoneyCharts.js')).href);
const { AuthProvider } = await import(pathToFileURL(join(bundleDir, 'auth.js')).href);
const { PrefsProvider } = await import(pathToFileURL(join(bundleDir, 'prefs.js')).href);

function render(node) {
  return renderToStaticMarkup(
    React.createElement(MantineProvider, null,
      React.createElement(MemoryRouter, null,
        React.createElement(PrefsProvider, null,
          React.createElement(AuthProvider, null, node)))),
  );
}

const t = (key) => ({
  'groupDetail.tabCategories': 'Categories',
  'groupDetail.categoriesHint': 'Each group has its own category list.',
  'groupDetail.categoryAdd': 'Add category',
  'groupDetail.categoryDefault': 'Default',
  'groupDetail.noCategories': 'No categories yet',
  'common.edit': 'Edit',
  'common.delete': 'Delete',
}[key] || key);

test('category manager hides edit and delete controls for default categories', () => {
  const html = render(React.createElement(CategoryManager, {
    categories: [
      { category_id: 'food', key: 'food', name: 'Food', is_default: true },
      { category_id: 'custom', key: 'custom', name: 'Custom', is_default: false },
    ],
    t,
    onAdd: () => {},
    onEdit: () => {},
    onDelete: () => {},
  }));

  assert.match(html, /settings-row/);
  assert.doesNotMatch(html, /aria-label="Edit Food"/);
  assert.match(html, /aria-label="Edit Custom"/);
  assert.doesNotMatch(html, /aria-label="Delete Food"/);
  assert.match(html, /aria-label="Delete Custom"/);
});

test('group header formats its creation subtitle with date and time in the current locale', () => {
  assert.equal(typeof formatGroupCreatedAt, 'function');
  assert.equal(
    formatGroupCreatedAt('2026-10-21T12:00:00', 'Created', 'en-US'),
    'Created · Oct 21, 2026, 12:00 PM',
  );
  assert.equal(formatGroupCreatedAt(null, 'Created', 'en-US'), null);
});

test('category manager keeps its add action beside the heading with an accessible mobile icon control', async () => {
  const html = render(React.createElement(CategoryManager, {
    categories: [],
    t,
    onAdd: () => {},
    onEdit: () => {},
    onDelete: () => {},
  }));
  const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');

  assert.match(html, /class="category-manager-head[^"]*"/);
  assert.match(html, /class="[^"]*category-manager-add[^"]*"[^>]*aria-label="Add category"/);
  assert.match(html, /class="category-manager-add-label">Add category<\/span>/);
  assert.match(
    styles,
    /@media \(max-width: 36em\)\s*\{[\s\S]*?\.category-manager-add\s*\{[\s\S]*?width:\s*36px;[\s\S]*?height:\s*36px;[\s\S]*?\.category-manager-add-label\s*\{\s*display:\s*none;/,
  );
});

test('report panel renders the injected manager after the category report card', () => {
  const reportProps = {
    groupId: 'test-group',
    detail: { name: 'Trip', currency: 'USD', members: [] },
    summary: [],
  };
  const standalone = render(React.createElement(ReportPanel, reportProps));
  const embedded = render(React.createElement(ReportPanel, {
    ...reportProps,
    categoryManager: React.createElement('aside', { 'data-testid': 'category-manager' }, 'Categories'),
  }));

  assert.doesNotMatch(standalone, /data-testid="category-manager"/);
  assert.match(embedded, /data-testid="category-manager"/);
  assert.ok(embedded.indexOf('By category') < embedded.indexOf('data-testid="category-manager"'));
});

test('report panel hides the settlement section only when no transfers remain', () => {
  const props = {
    groupId: '',
    detail: { name: 'Trip', currency: 'USD', members: [] },
    summary: [],
  };
  const settled = render(React.createElement(ReportPanel, {
    ...props,
    plan: { transfers: [] },
  }));
  const open = render(React.createElement(ReportPanel, {
    ...props,
    plan: {
      transfers: [{ from_user_id: 'mai', to_user_id: 'lan', amount_cents: 2500 }],
    },
  }));

  assert.doesNotMatch(settled, /report-settle-head/);
  assert.match(open, /report-settle-head/);
  assert.match(open, /report-settle-row/);
});

test('print report headers use the per-page brand and group hierarchy', async () => {
  const [report, styles] = await Promise.all([
    readFile(new URL('../src/pages/Report.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles.css', import.meta.url), 'utf8'),
  ]);

  assert.match(report, /report-doc-page-brand/);
  assert.match(report, /report-doc-page-group/);
  assert.match(styles, /\.report-doc-page-brand/);
  assert.match(styles, /\.report-doc-page-group/);
  assert.match(styles, /\.report-cover-meta-item\s*\{[\s\S]*padding:/);
  assert.match(styles, /\.report-doc-section-head\.is-page\s*\{[\s\S]*border-left:/);
});

test('print report cover places the app mark before the SplitShare brand label', async () => {
  const [report, styles] = await Promise.all([
    readFile(new URL('../src/pages/Report.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles.css', import.meta.url), 'utf8'),
  ]);

  assert.match(report, /report-cover-brand[\s\S]*?<BrandMark size=\{14\}[\s\S]*?t\('report\.brand'\)/);
  assert.match(styles, /\.report-cover-brand\s*\{[\s\S]*align-items:\s*center/);
});

test('mobile dark shell uses the same surface as the app stage', async () => {
  const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');

  assert.match(
    styles,
    /@media \(max-width: 47\.99em\)\s*\{[\s\S]*?\[data-ss-theme="dark"\] \.mantine-AppShell-main\s*\{\s*background:\s*#151718;/,
  );
});

test('mobile dark app stage does not render a separate background plate', async () => {
  const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  const darkStageRule = '[data-ss-theme="dark"] .app-stage {\n  background: #151718;';
  const mobileOverride = '@media (max-width: 47.99em) {\n  [data-ss-theme="dark"] .app-stage {';

  assert.ok(styles.indexOf(darkStageRule) >= 0);
  assert.ok(styles.lastIndexOf(mobileOverride) > styles.indexOf(darkStageRule));
  assert.match(styles.slice(styles.lastIndexOf(mobileOverride)), /background:\s*transparent;\s*box-shadow:\s*none;/);
});

test('mobile group actions open expense and payment forms directly', async () => {
  const groupDetail = await readFile(new URL('../src/pages/GroupDetail.jsx', import.meta.url), 'utf8');

  assert.doesNotMatch(groupDetail, /newSheetOpen|setNewSheetOpen/);
  assert.match(groupDetail, /className="gd-action-direct"[\s\S]*?setShowExp\(true\)/);
  assert.match(groupDetail, /className="gd-action-direct"[\s\S]*?setPayPreset\(null\); setPayOpen\(true\)/);
  assert.doesNotMatch(groupDetail, /<summary>\{t\('groupDetail\.groupSettings'\)\}<\/summary>/);
});

test('mobile group action bar does not add a divider above the primary actions', async () => {
  const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');

  assert.match(styles, /@media \(max-width: 36em\)\s*\{[\s\S]*?\.sticky-bar\.gd-actions\.is-calm\s*\{[\s\S]*?border-top:\s*0;/);
});

test('mobile report makes the settlement metric span the first row', async () => {
  const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');

  assert.match(styles, /@media \(max-width: 36em\)\s*\{[\s\S]*?\.report-status-card\s*\{\s*grid-column:\s*1\s*\/\s*-1;/);
});

test('mobile group details removes the action spacer and hides only the members metric', async () => {
  const [report, styles] = await Promise.all([
    readFile(new URL('../src/pages/Report.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles.css', import.meta.url), 'utf8'),
  ]);

  assert.match(report, /className="report-metric is-members"/);
  assert.match(styles, /@media \(max-width: 36em\)\s*\{[\s\S]*?\.gd-actions\.is-calm \+ \.sticky-spacer\s*\{\s*display:\s*none;/);
  assert.match(styles, /@media \(max-width: 36em\)\s*\{[\s\S]*?\.report-metric\.is-members\s*\{\s*display:\s*none;/);
});

test('mobile group danger actions share a row and confirmation dialogs stay compact', async () => {
  const [groupDetail, styles] = await Promise.all([
    readFile(new URL('../src/pages/GroupDetail.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles.css', import.meta.url), 'utf8'),
  ]);

  assert.match(styles, /\.gd-action-danger-opts\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/);
  assert.match(styles, /\.gd-action-danger-opts button:only-child\s*\{\s*grid-column:\s*1\s*\/\s*-1;/);
  assert.match(groupDetail, /content: 'wizard-modal-content group-danger-confirm-modal'/);
  assert.match(styles, /@media \(max-width: 36em\)\s*\{[\s\S]*?\.group-danger-confirm-modal\s*\{[\s\S]*?height:\s*auto !important;[\s\S]*?border-radius:\s*20px;/);
});

test('mobile group delete action does not show an owner badge', async () => {
  const groupDetail = await readFile(new URL('../src/pages/GroupDetail.jsx', import.meta.url), 'utf8');

  assert.doesNotMatch(groupDetail, /className="gd-action-owner"/);
});

test('mobile invite dialog wraps its content instead of filling the viewport', async () => {
  const [groupDetail, styles] = await Promise.all([
    readFile(new URL('../src/pages/GroupDetail.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles.css', import.meta.url), 'utf8'),
  ]);
  const inviteStart = groupDetail.indexOf('opened={inviteOpen}');
  const inviteEnd = groupDetail.indexOf('</Modal>', inviteStart);
  const inviteModal = groupDetail.slice(inviteStart, inviteEnd);

  assert.match(inviteModal, /content: 'wizard-modal-content invite-modal-content'/);
  assert.doesNotMatch(inviteModal, /fullScreen=/);
  assert.match(styles, /@media \(max-width: 36em\)\s*\{[\s\S]*?\.invite-modal-content\s*\{[\s\S]*?height:\s*auto !important;[\s\S]*?border-radius:\s*20px;/);
});

test('mobile new group dialog wraps its content instead of filling the viewport', async () => {
  const [dashboard, styles] = await Promise.all([
    readFile(new URL('../src/pages/Dashboard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles.css', import.meta.url), 'utf8'),
  ]);
  const modalStart = dashboard.indexOf('opened={open}');
  const modalEnd = dashboard.indexOf('</Modal>', modalStart);
  const modal = dashboard.slice(modalStart, modalEnd);

  assert.match(modal, /content: 'wizard-modal-content new-group-modal-content'/);
  assert.doesNotMatch(modal, /fullScreen=/);
  assert.match(styles, /@media \(max-width: 36em\)\s*\{[\s\S]*?\.new-group-modal-content\s*\{[\s\S]*?height:\s*auto !important;[\s\S]*?border-radius:\s*20px;/);
});

test('mobile bottom navigation shows a brand pill and menu name only for the active tab', async () => {
  const [bottomNav, styles] = await Promise.all([
    readFile(new URL('../src/components/BottomNav.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles.css', import.meta.url), 'utf8'),
  ]);

  assert.match(bottomNav, /bottom-nav-tab\$\{active \? ' is-active' : ''\}/);
  assert.match(bottomNav, /className="bottom-nav-dock"/);
  assert.match(bottomNav, /active && <span className="bottom-nav-label">\{label\}<\/span>/);
  assert.match(styles, /\.bottom-nav-dock\s*\{[\s\S]*background:\s*rgba\(255, 255, 255, 0\.9\);/);
  assert.match(styles, /\.bottom-nav-tab\.is-active\s*\{[\s\S]*background:\s*#16a34a;/);
  assert.doesNotMatch(styles, /\.bottom-nav-tab\.is-active \.bottom-nav-icon\s*\{/);
});

test('mobile bottom navigation keeps the active pill compact inside a roomier animated dock', async () => {
  const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');

  assert.match(styles, /\.bottom-nav-dock\s*\{[\s\S]*padding:\s*5px 12px;/);
  assert.match(styles, /\.bottom-nav-tab\.is-active\s*\{[\s\S]*padding:\s*0px 20px 0 12px;/);
  assert.match(styles, /\.bottom-nav-tab\s*\{[\s\S]*transition:\s*[^;]*padding[^;]*background[^;]*color/);
});

test('mobile bottom navigation does not show a press-state flash', async () => {
  const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');

  assert.doesNotMatch(styles, /\.bottom-nav-tab:active\s*\{/);
  assert.match(styles, /\.bottom-nav-tab\s*\{[\s\S]*?-webkit-tap-highlight-color:\s*transparent;/);
});

test('template editor uses a compact centered card on mobile', async () => {
  const [settings, styles] = await Promise.all([
    readFile(new URL('../src/pages/Settings.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles.css', import.meta.url), 'utf8'),
  ]);

  assert.match(settings, /content: 'wizard-modal-content template-modal-content'/);
  assert.match(settings, /\n\s*centered\n\s*size=\{440\}/);
  assert.doesNotMatch(settings, /marginTop:\s*'auto'/);
  assert.match(styles, /@media \(max-width: 36em\)\s*\{[\s\S]*?\.template-modal-content\s*\{[\s\S]*?width:\s*calc\(100vw - 32px\) !important;[\s\S]*?border-radius:\s*20px;/);
});

test('mobile form dialogs use the shared compact centered card instead of fullscreen sheets', async () => {
  const [groupDetail, expenseDetail, styles] = await Promise.all([
    readFile(new URL('../src/pages/GroupDetail.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/ExpenseDetail.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles.css', import.meta.url), 'utf8'),
  ]);

  assert.doesNotMatch(groupDetail, /fullScreen=\{isMobile\}/);
  assert.doesNotMatch(expenseDetail, /fullScreen=\{isMobile\}/);
  assert.match(styles, /@media \(max-width: 36em\)\s*\{[\s\S]*?\.wizard-modal-content\s*\{[\s\S]*?width:\s*calc\(100vw - 32px\) !important;[\s\S]*?height:\s*auto !important;[\s\S]*?border-radius:\s*20px;/);
});

test('printed report uses per-page header, no footer, and a bento-style cover', async () => {
  const [report, styles] = await Promise.all([
    readFile(new URL('../src/pages/Report.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles.css', import.meta.url), 'utf8'),
  ]);

  assert.match(report, /function ReportPageHeader\(\{ detail, pageNo, totalPages, t \}\)/);
  assert.match(report, /report-doc-page-brand[\s\S]*?t\('report\.brand'\)/);
  assert.match(report, /report-doc-page-group[\s\S]*?detail\.name/);
  assert.match(report, /t\('report\.pageOf', \{ current: pageNo, total: totalPages \}\)/);
  assert.doesNotMatch(report, /ReportDocFooter/);
  assert.match(report, /report-cover-bento/);
  assert.match(styles, /\.report-doc-sheet\s*\{[\s\S]*?border:\s*0;[\s\S]*?border-radius:\s*0;/);
  assert.match(styles, /\.report-cover-bento\s*\{[\s\S]*?display:\s*grid;/);
});

test('mobile per-person report uses flat rows separated by dividers', async () => {
  const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');

  assert.match(styles, /\.report-person-list\s*\{[\s\S]*?gap:\s*0;/);
  assert.match(styles, /\.report-person\s*\{[\s\S]*?background:\s*transparent;[\s\S]*?border:\s*0;/);
  assert.match(styles, /\.report-person \+ \.report-person\s*\{[\s\S]*?border-top:/);
  assert.match(styles, /\[data-ss-theme="dark"\] \.report-person \+ \.report-person\s*\{[\s\S]*?border-top-color:/);
});

test('mobile per-person report uses the shared avatar treatment with a separate net badge', () => {
  const html = render(React.createElement(ReportPanel, {
    groupId: '',
    detail: {
      name: 'Beach trip',
      currency: 'USD',
      members: [{ user_id: 'mai', display_name: 'Mai Nguyen', username: 'mai' }],
    },
    summary: [{
      user_id: 'mai',
      display_name: 'Mai Nguyen',
      total_paid_cents: 12500,
      total_share_cents: 10000,
      net_cents: 2500,
    }],
  }));

  assert.match(html, /class="report-person-avatar"[^>]*style="--rp-from:[^"]+--rp-to:[^"]+"[^>]*>MN<\/span>/);
  assert.match(html, /class="report-person-main"[\s\S]*?class="report-net is-owed"/);
});

test('member donut charts assign contrasting stable colors to colliding member ids', () => {
  const html = render(React.createElement(ReportPanel, {
    groupId: '',
    detail: { name: 'Beach trip', currency: 'USD', members: [] },
    summary: [
      { user_id: 'a', display_name: 'An', total_paid_cents: 1000, total_share_cents: 1000, net_cents: 0 },
      { user_id: 'k', display_name: 'Khoa', total_paid_cents: 2000, total_share_cents: 2000, net_cents: 0 },
      { user_id: 'u', display_name: 'Uyen', total_paid_cents: 3000, total_share_cents: 3000, net_cents: 0 },
    ],
  }));
  const strokes = new Set([...html.matchAll(/<circle[^>]*stroke="(#[0-9a-f]+)"/g)].map((match) => match[1]));

  assert.ok(strokes.has('#2dd4bf'));
  assert.ok(strokes.has('#38bdf8'));
  assert.ok(strokes.has('#fbbf24'));
});

test('category donut charts use distinct semantic colors', () => {
  const html = render(React.createElement(MoneyDonut, {
    rows: [
      { key: 'activity', label: 'Activity', value: 9500 },
      { key: 'food', label: 'Food', value: 27900 },
      { key: 'stay', label: 'Stay', value: 32000 },
    ],
    valueKey: 'value',
    currency: 'USD',
    colorMode: 'category',
  }));
  const strokes = new Set([...html.matchAll(/<circle[^>]*stroke="(#[0-9a-f]+)"/g)].map((match) => match[1]));

  assert.ok(strokes.has('#4ade80'));
  assert.ok(strokes.has('#fbbf24'));
  assert.ok(strokes.has('#22d3ee'));
});

test('printed reports use dark document colors when the app theme is dark', async () => {
  const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');

  assert.match(styles, /\[data-ss-theme="dark"\] \.report-doc\s*\{[\s\S]*?background:\s*#151718;/);
  assert.match(styles, /@media print\s*\{[\s\S]*?html\[data-ss-theme="dark"\],[\s\S]*?background:\s*#151718 !important;/);
});

test('printed report sheets keep their body in the physical page flow instead of clipping it', async () => {
  const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');

  assert.match(styles, /@media print\s*\{[\s\S]*?@page\s*\{[\s\S]*?size:\s*A4;[\s\S]*?margin:\s*0;/);
  assert.match(styles, /@media print\s*\{[\s\S]*?\.report-doc-sheet\s*\{[\s\S]*?display:\s*block !important;[\s\S]*?min-height:\s*297mm;[\s\S]*?break-after:\s*page;/);
  assert.match(styles, /@media print\s*\{[\s\S]*?\.report-doc-sheet\.is-cover\s*\{[\s\S]*?height:\s*auto;[\s\S]*?overflow:\s*visible;/);
  assert.match(styles, /@media print\s*\{[\s\S]*?\.report-doc-sheet-body\s*\{[\s\S]*?display:\s*block !important;/);
});

test('printed dark reports fill the page while keeping content inset and category highlights distinct', async () => {
  const [report, styles] = await Promise.all([
    readFile(new URL('../src/pages/Report.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles.css', import.meta.url), 'utf8'),
  ]);

  assert.match(report, /className="report-doc-ring" style=\{\{ '--pct': pct, '--ring-color': categoryColors\.get\(row\.key\) \}\}/);
  assert.match(styles, /\.report-doc-ring\s*\{[\s\S]*?conic-gradient\(var\(--ring-color\)/);
  assert.match(styles, /\.report-doc-ring-hole\s*\{[\s\S]*?background:\s*var\(--rd-surface\);/);
  assert.match(styles, /@media print\s*\{[\s\S]*?@page\s*\{[\s\S]*?size:\s*A4;[\s\S]*?margin:\s*0;/);
  assert.match(styles, /@media print\s*\{[\s\S]*?\.report-doc-sheet\s*\{[\s\S]*?min-height:\s*297mm;[\s\S]*?padding:\s*12mm 10mm 10mm;/);
  assert.match(styles, /@media print\s*\{[\s\S]*?html\[data-ss-theme="dark"\] \.shell-frame,[\s\S]*?background:\s*#151718 !important;/);
});

test('group access stages an owner status change for confirmation before it can update', async () => {
  const [groupDetail, styles] = await Promise.all([
    readFile(new URL('../src/pages/GroupDetail.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles.css', import.meta.url), 'utf8'),
  ]);

  assert.match(groupDetail, /const \[pendingGroupStatus, setPendingGroupStatus\] = useState\(null\);/);
  assert.match(groupDetail, /const requestGroupStatusChange = \(next\) => \{/);
  assert.match(groupDetail, /onChange=\{requestGroupStatusChange\}/);
  assert.match(groupDetail, /opened=\{statusConfirmOpen\}/);
  assert.match(groupDetail, /onClick=\{updateGroupStatus\}/);
  assert.match(groupDetail, /t\('groupStatus\.confirmTitle'\)/);
  assert.match(styles, /\.gd-lifecycle-control\s*\{[\s\S]*?border:/);
  assert.match(styles, /@media \(max-width: 36em\)\s*\{[\s\S]*?\.gd-lifecycle-control\s*\{[\s\S]*?position:\s*static;/);
});

test('desktop group access is a compact right-aligned picker while mobile keeps its touch width', async () => {
  const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');

  assert.match(styles, /\.gd-lifecycle-control\s*\{[\s\S]*?display:\s*flex;[\s\S]*?justify-content:\s*end;[\s\S]*?padding:\s*0;[\s\S]*?border:\s*0;[\s\S]*?background:\s*transparent;/);
  assert.match(styles, /\.gd-lifecycle-picker\s*\{[\s\S]*?width:\s*min\(280px, 100%\);/);
  assert.match(styles, /@media \(max-width: 36em\)\s*\{[\s\S]*?\.gd-lifecycle-picker\s*\{[\s\S]*?width:\s*100%;/);
});

test('desktop group access keeps one lifecycle badge beside settlement and moves its picker to the hero edge', async () => {
  const [groupDetail, styles] = await Promise.all([
    readFile(new URL('../src/pages/GroupDetail.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles.css', import.meta.url), 'utf8'),
  ]);

  assert.doesNotMatch(groupDetail, /gd-tag gd-lifecycle/);
  assert.match(groupDetail, /className=\{`net-chip is-\$\{groupStatusTone\}`\}[\s\S]*?className=\{`gd-lifecycle is-\$\{groupLifecycle\}`\}/);
  assert.doesNotMatch(groupDetail, /gd-lifecycle-current/);
  assert.match(styles, /\.gd-lifecycle-control\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?right:\s*24px;[\s\S]*?top:\s*50%;/);
  assert.match(styles, /\.gd-lifecycle-picker \.mantine-Select-input\s*\{[\s\S]*?background:\s*transparent;/);
  assert.match(styles, /@media \(max-width: 36em\)\s*\{[\s\S]*?\.gd-lifecycle-control\s*\{[\s\S]*?position:\s*static;/);
});

test('group access displays only its right-aligned dropdown without duplicate explanatory copy', async () => {
  const [groupDetail, styles] = await Promise.all([
    readFile(new URL('../src/pages/GroupDetail.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles.css', import.meta.url), 'utf8'),
  ]);

  assert.doesNotMatch(groupDetail, /className="gd-lifecycle-copy"/);
  assert.doesNotMatch(groupDetail, /className="gd-lifecycle-picker"[\s\S]*?groupStatus\.\$\{groupLifecycle\}Hint/);
  assert.match(styles, /\.gd-lifecycle-control\s*\{[\s\S]*?justify-content:\s*end;/);
  assert.match(styles, /\.gd-lifecycle-picker\s*\{[\s\S]*?justify-self:\s*end;/);
  assert.match(styles, /\[data-ss-theme="dark"\] \.gd-lifecycle-control\s*\{[^}]*background:\s*transparent;/);
});

test('group access dropdown marks the selected status with emphasis instead of a check icon', async () => {
  const [groupDetail, styles] = await Promise.all([
    readFile(new URL('../src/pages/GroupDetail.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles.css', import.meta.url), 'utf8'),
  ]);

  assert.match(groupDetail, /classNames=\{\{ option: 'group-status-option' \}\}/);
  assert.match(groupDetail, /withCheckIcon=\{false\}/);
  assert.match(styles, /\.group-status-option\[data-combobox-selected\]\s*\{[\s\S]*?font-weight:\s*800;/);
});

test('mobile statement uses flat, scannable transaction rows', async () => {
  const html = render(React.createElement(StatementMobileList, {
    currency: 'USD',
    entries: [
      {
        entry: { title: 'Dinner Hai San Be', kind: 'paid', at: '2026-10-18T18:03:00.000Z', amount_cents: 20150 },
        running_cents: 20150,
      },
      {
        entry: { title: 'Grab car', kind: 'share', at: '2026-10-19T00:00:00.000Z', amount_cents: 1050 },
        running_cents: 19100,
      },
      {
        entry: { title: 'Paid Khoa Tran', kind: 'payment_out', at: '2026-10-20T00:00:00.000Z', amount_cents: 2000 },
        running_cents: 21100,
      },
      {
        entry: { title: 'Received from Mai', kind: 'payment_in', at: '2026-10-21T00:00:00.000Z', amount_cents: 1500 },
        running_cents: 19600,
      },
    ],
    closingCents: 19600,
  }));

  assert.match(html, /class="statement-mobile-list"/);
  assert.match(html, /class="statement-mobile-entry"/);
  assert.match(html, /class="statement-mobile-entry-kind is-paid">paid<\/span>/);
  assert.match(html, /class="statement-mobile-entry-kind is-share">share<\/span>/);
  assert.match(html, /class="statement-mobile-entry-kind is-payment-out">payment out<\/span>/);
  assert.match(html, /class="statement-mobile-entry-kind is-payment-in">payment in<\/span>/);
  assert.match(html, /class="statement-mobile-entry-date"/);
  assert.match(html, /class="statement-mobile-entry-time"/);
  assert.match(html, /class="statement-mobile-entry-amount">\$201\.50<\/span>/);
  assert.match(html, /class="statement-mobile-entry-running">→ \$201\.50<\/span>/);
  assert.match(html, /class="statement-mobile-closing"/);

  const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(styles, /\.statement-mobile-entry \+ \.statement-mobile-entry\s*\{[\s\S]*?border-top:/);
  assert.match(styles, /\.statement-mobile-entry-kind\s*\{[\s\S]*?text-transform:\s*uppercase;/);
  assert.match(styles, /\.statement-mobile-entry-kind\.is-paid\s*\{[\s\S]*?color:/);
  assert.match(styles, /\.statement-mobile-entry-kind\.is-share\s*\{[\s\S]*?color:/);
  assert.match(styles, /\.statement-mobile-entry-kind\.is-payment-out\s*\{[\s\S]*?color:/);
  assert.match(styles, /\.statement-mobile-entry-kind\.is-payment-in\s*\{[\s\S]*?color:/);
  const amountRule = styles.match(/\.statement-mobile-entry-amount\s*\{([^}]*)\}/)?.[1] || '';
  const darkAmountRules = [...styles.matchAll(/\[data-ss-theme="dark"\] \.statement-mobile-entry-amount\s*\{([^}]*)\}/g)];
  const darkAmountRule = darkAmountRules.at(-1)?.[1] || '';
  assert.match(amountRule, /padding:/);
  assert.match(amountRule, /background:\s*transparent;/);
  assert.match(darkAmountRule, /background:\s*transparent;/);
  assert.match(amountRule, /color:\s*#075f3d;/);
  assert.match(darkAmountRule, /color:\s*#6ef0aa;/);
});

test('desktop statement uses flat rows with a distinct event status label', async () => {
  const [statement, styles] = await Promise.all([
    readFile(new URL('../src/pages/Statement.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles.css', import.meta.url), 'utf8'),
  ]);

  assert.match(statement, /<Table className="statement-table"/);
  assert.doesNotMatch(statement, /<Table striped highlightOnHover withTableBorder/);
  assert.match(statement, /className=\{`statement-table-kind is-\$\{kind\.replaceAll\('_', '-'\)\}`\}/);
  assert.match(statement, /className="statement-table-event"/);
  assert.match(styles, /\.statement-table\s*\{[\s\S]*?border-collapse:\s*collapse;/);
  assert.match(styles, /\.statement-table \.mantine-Table-td\s*\{[\s\S]*?border-bottom:/);
  assert.match(styles, /\.statement-table-kind\.is-paid\s*\{[\s\S]*?color:/);
  assert.match(styles, /\.statement-table-closing .mantine-Table-td\s*\{[\s\S]*?border-top:/);
});

test('mobile recurring tab separates its add form and rule rows', async () => {
  const members = [{ user_id: 'mai', display_name: 'Mai Nguyen' }];
  const form = render(React.createElement(RecurringForm, {
    groupId: 'trip',
    members,
    t,
    onDone: () => {},
  }));
  const rules = render(React.createElement(RecurringRuleList, {
    currency: 'USD',
    rules: [{
      rule_id: 'rent',
      title: 'Rent',
      amount_cents: 120000,
      frequency: 'monthly',
      next_run_at: '2026-11-01T12:00:00.000Z',
      active: true,
    }],
    t,
    onToggle: () => {},
    onDelete: () => {},
  }));

  assert.match(form, /class="recurring-form"/);
  assert.match(form, /class="[^"]*recurring-form-title/);
  assert.match(form, /class="[^"]*recurring-form-submit/);
  assert.match(rules, /class="recurring-rule-list"/);
  assert.match(rules, /class="recurring-rule-row"/);
  assert.match(rules, /class="recurring-rule-frequency">monthly<\/span>/);
  assert.match(rules, /class="recurring-rule-amount">\$1,200\.00<\/span>/);

  const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(styles, /@media \(max-width: 36em\)\s*\{[\s\S]*?\.recurring-form\s*\{[\s\S]*?grid-template-columns:/);
  assert.match(styles, /\.recurring-form-submit\s*\{[\s\S]*?grid-column:\s*1\s*\/\s*-1;/);
  assert.match(styles, /\.recurring-rule-row \+ \.recurring-rule-row\s*\{[\s\S]*?border-top:/);
});

test('recurring amount formats group currency and mobile fields fill one column', async () => {
  assert.equal(formatRecurringAmount('1234.5', 'USD'), '$1,234.50');
  assert.equal(formatRecurringAmount('1234.5', 'VND'), '₫1,234.50');
  assert.equal(formatRecurringAmount('', 'USD'), '');

  const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(styles, /@media \(max-width: 36em\)\s*\{[\s\S]*?\.recurring-form\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\);/);
  assert.match(styles, /\.recurring-form-amount\s*\{[\s\S]*?width:\s*100%;/);
});

test('mobile expense rows use quiet status labels and dedicated copy and edit actions', async () => {
  const [groupDetail, styles] = await Promise.all([
    readFile(new URL('../src/pages/GroupDetail.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles.css', import.meta.url), 'utf8'),
  ]);

  assert.match(groupDetail, /className="ledger-action-btn is-copy"/);
  assert.match(groupDetail, /className="ledger-action-btn is-edit"/);
  assert.match(styles, /\.ledger-status\s*\{[\s\S]*?background:\s*transparent;[\s\S]*?border:\s*0;[\s\S]*?padding:\s*0;/);
  assert.match(styles, /\.ledger-action-btn\s*\{[\s\S]*?border:/);
  assert.match(styles, /\.ledger-thumb\s*\{[\s\S]*?box-shadow:/);
});

test('mobile balances render debtors and payments as flat rows with clear actions', async () => {
  const members = [
    { user_id: 'hung', display_name: 'Hung Le' },
    { user_id: 'lan', display_name: 'Lan Pham' },
  ];
  const html = render(React.createElement(BalancesPanel, {
    byDebtor: [['hung', [{ to_user_id: 'lan', amount_cents: 6716 }]]],
    debtors: [],
    members,
    currency: 'USD',
    t,
    onNudge: () => {},
    onPay: () => {},
  }));

  assert.match(html, /class="balance-mobile-list"/);
  assert.match(html, /class="balance-mobile-debtor"/);
  assert.match(html, /class="balance-mobile-transfer"/);
  assert.match(html, /class="balance-mobile-pay"/);
  assert.match(html, /Hung Le/);
  assert.match(html, /Lan Pham/);
  assert.match(html, /\$67\.16/);

  const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(styles, /\.balance-mobile-debtor \+ \.balance-mobile-debtor\s*\{[\s\S]*?border-top:/);
  assert.match(styles, /\.balance-mobile-pay\s*\{[\s\S]*?background:/);
});

test('people rows place the role tag at the right edge and vertically centered', async () => {
  const [groupDetail, styles] = await Promise.all([
    readFile(new URL('../src/pages/GroupDetail.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles.css', import.meta.url), 'utf8'),
  ]);

  assert.match(groupDetail, /className=\{`gd-person-tag gd-person-role \$\{roleClass\}`\}/);
  assert.match(styles, /\.gd-person-role\s*\{[\s\S]*?margin-left:\s*auto;[\s\S]*?align-self:\s*center;/);
});

test('settlement transfers use a flat list and a primary Pay action', async () => {
  const [report, styles] = await Promise.all([
    readFile(new URL('../src/pages/Report.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles.css', import.meta.url), 'utf8'),
  ]);

  assert.match(report, /className="report-settle-pay"/);
  assert.match(styles, /\.report-settle-row\s*\{[\s\S]*?border-radius:\s*0;[\s\S]*?background:\s*transparent;/);
  assert.match(styles, /\.report-settle-row:not\(:last-child\)::after\s*\{[\s\S]*?height:\s*1px;/);
  assert.match(styles, /\.report-settle-pay\s*\{[\s\S]*?min-height:\s*32px;[\s\S]*?background:\s*#0f9f6e/);
});

test('settlement detail dialog keeps the body scrollable with flat rows and compact Pay controls', async () => {
  const [settlement, styles] = await Promise.all([
    readFile(new URL('../src/components/SettlementBox.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles.css', import.meta.url), 'utf8'),
  ]);

  assert.match(settlement, /body:\s*'wizard-modal-body settle-modal-body'/);
  assert.match(settlement, /className="settle-xfer-pay"/);
  assert.match(styles, /\.settle-modal-body\s*\{[\s\S]*?overflow-y:\s*auto;[\s\S]*?min-height:\s*0;/);
  assert.match(styles, /\.settle-balance-row,[\s\S]*?\.settle-xfer-row,[\s\S]*?\.settle-pay-row\s*\{[\s\S]*?border-radius:\s*0;[\s\S]*?background:\s*transparent;/);
  assert.match(styles, /\.settle-xfer-pay\s*\{[\s\S]*?min-height:\s*32px;[\s\S]*?padding:/);
});

test.after(async () => { await rm(bundleDir, { recursive: true, force: true }); });
