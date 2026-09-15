import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

config({ path: ".env.test", quiet: true });
config({ path: ".env", quiet: true });

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
    { name: "desktop-chrome", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    // Production build: tests what ships, and does not clash with a running `next dev`
    // (Next.js allows only one dev server per project directory).
    command: `pnpm build && pnpm exec next start --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      // E2E always runs against the dedicated test database.
      DATABASE_URL: process.env.DATABASE_URL_TEST ?? "",
      APP_URL: baseURL,
      MAIL_DRIVER: "file",
      MAIL_FILE_DIR: ".data/mail-e2e",
    },
  },
});
