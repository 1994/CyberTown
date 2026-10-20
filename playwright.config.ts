import { defineConfig } from '@playwright/test';

// E2E 使用独立端口与独立数据库（不影响 8787 上的共享演示/预览）。
// 运行前需已构建：npm run build（dist/ + bin/boss-server）。npm run test:e2e 会自动构建。
const PORT = Number(process.env.E2E_PORT ?? 8899);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 180_000,
  expect: { timeout: 10_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [['list'], ['json', { outputFile: 'test-results/e2e-report.json' }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    channel: process.env.E2E_CHANNEL ?? 'chrome',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node scripts/start-e2e-server.ts',
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
