import { defineConfig, devices } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const webDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(webDir, '..');

/**
 * .env.e2e is the single E2E environment (test Postgres database, external side
 * effects off). scripts/e2e.sh exports it before running this suite; parsing it
 * here as well keeps `npm run test:e2e` working on its own. Shell values win.
 */
function readEnvFile(path) {
  if (!existsSync(path)) return {};
  const env = {};
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

// Dedicated ports: an already-running dev API/Vite (8081/3000) must not be
// touched, and the suite always talks to this run's servers.
const API_URL = 'http://localhost:8093';
const WEB_URL = 'http://localhost:3013';
const e2eEnv = {
  ...readEnvFile(join(repoRoot, '.env.e2e')),
  ...process.env,
  ASPNETCORE_URLS: API_URL,
  VITE_API_URL: API_URL,
};

export default defineConfig({
  testDir: './e2e',
  // The smoke flow creates one account and one group; keep the shared test
  // database and the two dev servers calm.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      // Real API pipeline on the E2E database from .env.e2e. Launch settings are
      // skipped so the file's ASPNETCORE_URLS decides the port deterministically.
      command: 'dotnet run --project api/SplitShare.Api.csproj --no-launch-profile',
      cwd: repoRoot,
      url: `${API_URL}/health`,
      timeout: 180_000,
      reuseExistingServer: false,
      env: e2eEnv,
    },
    {
      // Vite proxies /api to VITE_API_URL (the E2E API above).
      command: 'npm run dev -- --port 3013 --strictPort',
      cwd: webDir,
      url: WEB_URL,
      timeout: 60_000,
      reuseExistingServer: false,
      env: e2eEnv,
    },
  ],
});
