// Static wiring check (spec 005 task 5.7): the Expo app has no bundler-side
// type checking in CI, so a renamed screen or a typo in a route name would only
// surface on a device. This pins three things:
//   1. every relative import in App.js resolves to a file,
//   2. every named import is actually exported by that file,
//   3. every navigation.navigate/push target (and push tap target) is registered
//      as a Stack/Tab screen.
// Run: npm test
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const appPath = path.join(root, 'App.js');
const app = fs.readFileSync(appPath, 'utf8');

const isExported = (src, name) =>
  new RegExp(`export\\s+(async\\s+)?(function|const|class)\\s+${name}\\b`).test(src) ||
  new RegExp(`export\\s*\\{[^}]*\\b${name}\\b`).test(src);

test('App.js imports resolve and named exports exist', () => {
  const imports = [...app.matchAll(/import\s+([^;]+?)\s+from\s+'(\.[^']+)'/g)];
  assert.ok(imports.length >= 20, 'App.js should import the full screen set');

  const problems = [];
  for (const [, clause, spec] of imports) {
    const base = path.join(root, spec);
    const file = [base, `${base}.js`, `${base}.jsx`, path.join(base, 'index.js')]
      .find((p) => fs.existsSync(p));
    if (!file) { problems.push(`missing module ${spec}`); continue; }
    const src = fs.readFileSync(file, 'utf8');
    const named = [...clause.matchAll(/\{([^}]*)\}/g)]
      .flatMap((m) => m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]))
      .filter(Boolean);
    for (const n of named) {
      if (!isExported(src, n)) problems.push(`missing export ${n} in ${spec}`);
    }
  }
  assert.deepEqual(problems, []);
});

test('every navigation target is a registered route', () => {
  const registered = new Set(
    [...app.matchAll(/<(?:Stack|Tab)\.Screen\s+name="([^"]+)"/g)].map((m) => m[1]),
  );
  assert.ok(registered.has('Main') && registered.has('GroupDetail'), 'core routes registered');

  const targets = new Set();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.jsx?$/.test(e.name)) continue;
      const src = fs.readFileSync(p, 'utf8');
      for (const m of src.matchAll(/navigation\.(?:navigate|push)\(\s*'([A-Za-z]+)'/g)) targets.add(m[1]);
      for (const m of src.matchAll(/onNavigate\(\s*'([A-Za-z]+)'/g)) targets.add(m[1]);
    }
  };
  walk(path.join(root, 'src'));

  assert.ok(targets.size >= 15, 'screens navigate across the whole app');
  const unregistered = [...targets].filter((n) => !registered.has(n));
  assert.deepEqual(unregistered, []);
});

test('deep link config names only registered routes', () => {
  const registered = new Set(
    [...app.matchAll(/<(?:Stack|Tab)\.Screen\s+name="([^"]+)"/g)].map((m) => m[1]),
  );
  const config = app.slice(app.indexOf('const linking'), app.indexOf('function AddPlaceholder'));
  // Only route entries (Name: 'pattern'); nested objects like `screens: {` are not routes.
  const names = [...config.matchAll(/^\s+([A-Za-z]+):\s*'[^']*'/gm)].map((m) => m[1]);
  assert.ok(names.includes('GroupDetail') && names.includes('SharePublic'));
  assert.deepEqual(names.filter((n) => !registered.has(n)), []);
});
