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
const { CategoryManager } = await import(pathToFileURL(groupBundlePath).href);
await build({
  entryPoints: [
    new URL('../src/pages/Report.jsx', import.meta.url).pathname,
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

test('category manager renders settings-style edit controls and hides delete for defaults', () => {
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
  assert.match(html, /aria-label="Edit Food"/);
  assert.match(html, /aria-label="Edit Custom"/);
  assert.doesNotMatch(html, /aria-label="Delete Food"/);
  assert.match(html, /aria-label="Delete Custom"/);
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

test('print report headers use the refined cover and page hierarchy', async () => {
  const [report, styles] = await Promise.all([
    readFile(new URL('../src/pages/Report.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles.css', import.meta.url), 'utf8'),
  ]);

  assert.match(report, /report-doc-page-eyebrow/);
  assert.match(styles, /\.report-doc-page-eyebrow/);
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

test.after(async () => { await rm(bundleDir, { recursive: true, force: true }); });
