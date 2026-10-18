import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "*.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:19080",
    locale: "es-CO",
    timezoneId: "America/Bogota",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
    launchOptions: {
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
        ? {
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
            args: ["--no-sandbox", "--disable-dev-shm-usage", "--no-zygote"],
          }
        : {}),
    },
  },
  reporter: [["list"], ["html", { open: "never" }]],
  webServer: [
    {
      command: "bun tests/e2e/core-fixture.ts",
      url: "http://127.0.0.1:19081/api/v1/health/live",
      env: { NODE_ENV: "test" },
      reuseExistingServer: false,
    },
    {
      command: "bun run --filter @tfl/web start --port 19080",
      url: "http://127.0.0.1:19080/login",
      env: {
        CORE_INTERNAL_URL: "http://127.0.0.1:19081",
        WEB_ORIGIN: "http://127.0.0.1:19080",
        NODE_ENV: "production",
      },
      reuseExistingServer: false,
    },
  ],
});
