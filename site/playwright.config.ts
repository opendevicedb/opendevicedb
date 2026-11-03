import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
const external = process.env.ODB_SITE_URL;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
export default defineConfig({
  testDir: "./test/ui",
  outputDir: process.env.ODB_UI_RESULTS || "/tmp/opendevicedb-ui-results",
  fullyParallel: true,
  workers: 2,
  timeout: 45000,
  reporter: "list",
  use: {
    baseURL: external || "http://127.0.0.1:4322",
    launchOptions: { executablePath, args: ["--no-sandbox"] },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    reducedMotion: "reduce",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1920, height: 1080 } } },
    { name: "tablet", use: { viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true } },
    { name: "phone", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: "small-phone", use: { viewport: { width: 320, height: 740 }, isMobile: true, hasTouch: true } },
  ],
  webServer: external ? undefined : {
    command: "npm run preview -- --host 127.0.0.1 --port 4322 --ignore-lock",
    url: "http://127.0.0.1:4322",
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
