import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('dashboard uses money-shaped shimmer placeholders while balances load', async () => {
  const [dashboard, styles] = await Promise.all([
    readFile(new URL('../src/pages/Dashboard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles.css', import.meta.url), 'utf8'),
  ]);

  assert.match(dashboard, /className="dash-value-shimmer"/);
  assert.match(dashboard, /className="dash-delta-shimmer"/);
  assert.match(styles, /\.dash-value-shimmer,[\s\S]*?\.dash-delta-shimmer\s*\{[\s\S]*?animation:\s*dash-shimmer/);
  assert.match(styles, /@keyframes dash-shimmer/);
});
