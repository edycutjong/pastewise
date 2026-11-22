import { expect, test } from "@playwright/test";

// Runs against the deployed site: `npm run e2e:live`. No Fill with a valid paste (no model call, no quota).

test("live: page renders, security headers are served, no CSP violation or page error", async ({ page }) => {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => /Content Security Policy|violates the following/i.test(m.text()) && problems.push(m.text()));
  const res = await page.goto("/");
  expect(res?.status()).toBe(200);
  const h = res!.headers();
  expect(h["content-security-policy"]).toContain("default-src 'self'");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["referrer-policy"]).toBe("no-referrer");
  await expect(page.getByRole("heading", { name: "Pastewise" })).toBeVisible();
  await expect(page.getByTestId("ledger-bytes")).toHaveText("0 bytes found");
  expect(problems).toEqual([]);
});

test("live: sample loads, an empty paste is refused before any model call", async ({ page }) => {
  const ai: string[] = [];
  page.on("request", (r) => /firebasevertexai|generativelanguage/.test(r.url()) && ai.push(r.url()));
  await page.goto("/");
  await page.getByRole("button", { name: /Fill this message/ }).click();
  await expect(page.getByRole("status")).toContainText("Paste an order or booking message");
  await page.getByTestId("sample-S1").click();
  await expect(page.locator("#paste")).toHaveValue(/Ratna Kusuma/);
  expect(ai).toEqual([]);
});

test("live: /bench and /receipt render from committed evidence", async ({ page }) => {
  for (const path of ["/bench/", "/receipt/"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(page.locator("main")).not.toBeEmpty();
  }
  await page.goto("/bench/");
  await expect(page.getByRole("heading", { name: /Set holdout/ })).toBeVisible();
  await expect(page.getByText("57077867")).toBeVisible();
});

test("live: no Nano in this profile, so Fill opens the consent sheet and sends nothing before a Yes", async ({ page }) => {
  const ai: string[] = [];
  page.on("request", (r) => /firebasevertexai|generativelanguage/.test(r.url()) && ai.push(r.url()));
  await page.addInitScript(() => {
    // @ts-expect-error force the no-Nano judge path regardless of this machine's Chrome
    delete globalThis.LanguageModel;
  });
  await page.goto("/");
  await page.getByTestId("sample-S3").click();
  await page.getByRole("button", { name: /Fill this message/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(ai).toEqual([]);
});

test("live: App Check is enforced, a request with the public API key but no App Check token is rejected for that reason", async ({ request }) => {
  // The key is public by design (it ships in the bundle); it comes from .env.local or LIVE_FIREBASE_API_KEY, never from the repo.
  let key = process.env.LIVE_FIREBASE_API_KEY ?? "";
  if (!key) {
    try {
      key = /^NEXT_PUBLIC_FIREBASE_API_KEY=(.+)$/m.exec((await import("node:fs")).readFileSync(".env.local", "utf8"))?.[1]?.trim() ?? "";
    } catch {
      /* no .env.local */
    }
  }
  test.skip(!key, "needs the public Firebase API key (.env.local or LIVE_FIREBASE_API_KEY)");
  const url = "https://firebasevertexai.googleapis.com/v1beta/projects/pastewise-hybrid-ai/models/gemini-3.5-flash-lite:generateContent";
  const body = { contents: [{ role: "user", parts: [{ text: "hi" }] }] };
  const res = await request.post(url, { headers: { "x-goog-api-key": key }, data: body });
  expect(res.status()).toBe(401);
  expect((await res.json()).error.message).toMatch(/App Check/i);
  // control: the same call without the key is a different error, so the assertion above is about App Check and not about a missing key
  const noKey = await request.post(url, { data: body });
  expect((await noKey.json()).error.message).not.toMatch(/App Check/i);
});
