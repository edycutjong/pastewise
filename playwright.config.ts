import { defineConfig } from "@playwright/test";

// E2E runs against the static export (the same files Vercel serves).
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000, // some expectations wait up to 40 s for a fill timeout; the 30 s default would end the test first
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3102", channel: process.env.PW_CHANNEL ?? "chrome" },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npx serve out -l 3102", url: "http://localhost:3102", reuseExistingServer: false, timeout: 60_000 },
});
