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

test("live: App Check is enforced, an unattested request to AI Logic is rejected", async ({ request }) => {
  const res = await request.post("https://firebasevertexai.googleapis.com/v1beta/projects/pastewise-hybrid-ai/locations/global/publishers/google/models/gemini-2.5-flash:generateContent", {
    data: { contents: [{ role: "user", parts: [{ text: "hi" }] }] },
  });
  expect([400, 401, 403]).toContain(res.status());
});
