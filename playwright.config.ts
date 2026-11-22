import { defineConfig } from "@playwright/test";

// E2E runs against the static export (the same files Vercel serves).
export default defineConfig({
  testDir: "tests/e2e",
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3102", channel: "chrome" },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npx --yes serve out -l 3102", url: "http://localhost:3102", reuseExistingServer: false, timeout: 60_000 },
});
