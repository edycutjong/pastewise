import { defineConfig } from "@playwright/test";

// E2E against the deployed site (production App Check, the CSP header from vercel.json). Not run in CI:
// it needs a real Chrome and the live URL, and the cloud-path checks spend free-tier quota.
export default defineConfig({
  testDir: "tests/live",
  timeout: 90_000,
  retries: 1,
  use: { baseURL: process.env.LIVE_URL ?? "https://pastewise.edycu.dev", channel: process.env.PW_CHANNEL ?? "chrome" },
});
