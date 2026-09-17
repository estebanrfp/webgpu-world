import { defineConfig, devices } from '@playwright/test';

/**
 * Every peer runs in its own BrowserContext, and the suite shares one signaling
 * network, so the specs run serially.
 */
export default defineConfig({
  testDir: './tests',
  workers: 1,
  fullyParallel: false,
  timeout: 180_000,
  // P2P convergence is seconds, not milliseconds: relay discovery, then WebRTC.
  expect: { timeout: 30_000 },
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--enable-unsafe-webgpu',              // the world will not boot without WebGPU
            '--disable-background-timer-throttling', // a throttled peer stops broadcasting
            '--disable-renderer-backgrounding',
            '--disable-backgrounding-occluded-windows',
          ],
        },
      },
    },
  ],
  webServer: {
    // --no-open matters: Vite would open a real tab, and that tab is an extra
    // peer in the room - exactly what makes a P2P suite lie.
    command: 'pnpm exec vite --port 5173 --no-open',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
