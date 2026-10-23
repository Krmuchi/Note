import { defineConfig, devices } from '@playwright/test';

/**
 * E2E 配置。
 *
 * 目前全部用例跑在 Web 模式（无 Electron IPC），`webServer` 会自动执行
 * `vite build` + `vite preview`，因此 `npm run test:e2e` 不再需要手工先起服务
 * （旧配置无 webServer，必须自己在另一个终端跑 dev server，否则整批用例以
 * ERR_CONNECTION_REFUSED 失败）。
 *
 * 本地已手动起了 5173 服务时直接复用，避免重复构建。
 */
export default defineConfig({
  testDir: 'tests/e2e',
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
  },
  webServer: {
    // 用 preview 而非 dev：dev 首次启动要预构建依赖，慢且易受锁文件变化影响
    command: 'npm run build && npx vite preview --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});