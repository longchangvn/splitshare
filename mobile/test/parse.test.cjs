// Every screen/component must at least parse as JSX. Metro only reports a syntax
// error when the app boots on a device, so this keeps `npm test` honest for the
// ~10k lines of UI code that the unit tests never import.
// Run: npm test
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.jsx?$/.test(e.name)) files.push(p);
  }
})(path.join(root, 'src'));
files.push(path.join(root, 'App.js'));

test('every mobile source file parses as JSX', () => {
  const babel = require('@babel/core');
  assert.ok(files.length > 40, `expected the whole app, found ${files.length} files`);
  const failures = [];
  for (const file of files) {
    try {
      babel.parseSync(fs.readFileSync(file, 'utf8'), {
        filename: file,
        babelrc: false,
        configFile: false,
        sourceType: 'module',
        parserOpts: { plugins: ['jsx'] },
      });
    } catch (err) {
      failures.push(`${path.relative(root, file)}: ${err.message.split('\n')[0]}`);
    }
  }
  assert.deepEqual(failures, []);
});
