import { expect, test } from "@playwright/test";

const MSG = "Hello! Please send 2 notebooks to Tia Ramadhani, 0813 0000 1111, Jl. Kopo 9, Bandung, Jawa Barat 40222.";

// A browser with no on-device API: the consent sheet is the only way forward, and it asks before anything leaves.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    delete (globalThis as { LanguageModel?: unknown }).LanguageModel;
  });
});

test("no on-device model: Fill opens the consent sheet with the exact text and size, and sends nothing", async ({ page }) => {
  const aiRequests: string[] = [];
  page.on("request", (r) => /firebasevertexai|generativelanguage/.test(r.url()) && aiRequests.push(r.url()));
  await page.goto("/");
  await page.locator("#paste").fill(MSG);
  await page.getByRole("button", { name: /Fill this message/ }).click();
  const sheet = page.getByRole("dialog", { name: /Send this one message to the cloud/ });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId("consent-text")).toHaveText(MSG);
  await expect(sheet).toContainText(`${MSG.length} characters, ${new TextEncoder().encode(MSG).length} bytes`);
  await expect(sheet).toContainText("This laptop can't run the on-device model");
  await sheet.getByTestId("consent-decline").click();
  await expect(sheet).toBeHidden();
  expect(aiRequests).toEqual([]);
  await expect(page.getByTestId("ledger-bytes")).toHaveText("0 bytes found");
  await expect(page.getByTestId("consent-bytes")).toHaveCount(0);
});

test("consent sheet shows the how-to and the labelled recorded-run replay", async ({ page }) => {
  await page.goto("/");
  await page.locator("#paste").fill(MSG);
  await page.locator("#paste").press("ControlOrMeta+Enter");
  const sheet = page.getByRole("dialog", { name: /Send this one message to the cloud/ });
  await sheet.getByText("How to get the on-device model").click();
  await expect(sheet).toContainText("Gemma 4 for Built-in AI");
  await sheet.getByRole("button", { name: "Watch a recorded run" }).click();
  await expect(sheet.getByText("Recorded — not live")).toBeVisible();
});

test("Teach this form shows the empty-form payload before anything is sent", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "C · CONSIGNMENT NOTE" }).click();
  await page.locator("#paste").fill(MSG);
  await page.getByRole("button", { name: "Teach this form" }).click();
  const drawer = page.getByRole("dialog", { name: "Teach this form" });
  const payload = drawer.getByTestId("teach-payload");
  await expect(payload).toContainText("cnee_nm");
  await expect(payload).not.toContainText("Tia");
  await expect(payload).not.toContainText("0813");
  await drawer.getByRole("button", { name: "Close" }).click();
  await expect(drawer).toBeHidden();
});

test("/bench and /receipt render from committed evidence and keep the nav", async ({ page }) => {
  await page.goto("/bench/");
  await expect(page.getByRole("heading", { name: "Bench" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Receipt" })).toBeVisible();
  await page.getByRole("link", { name: "Receipt" }).click();
  await expect(page.getByRole("heading", { name: "Receipt" })).toBeVisible();
  await expect(page.getByText("This session, live")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Recorded network log/ })).toBeVisible();
});

// A stand-in for a Chrome whose model is not downloaded yet: availability says "downloadable", create() reports
// progress through the monitor and then never finishes. The page must show the first-run screen and offer the cloud choice.
test("first run: download screen shows progress and the cloud choice opens the not-ready consent copy", async ({ page }) => {
  await page.addInitScript(() => {
    (globalThis as unknown as { LanguageModel: unknown }).LanguageModel = {
      availability: async () => "downloadable",
      create: async (opts?: { monitor?: (m: EventTarget) => void }) => {
        const m = new EventTarget();
        opts?.monitor?.(m);
        await new Promise((r) => setTimeout(r, 100));
        m.dispatchEvent(Object.assign(new Event("downloadprogress"), { loaded: 0.4 }));
        return new Promise(() => {});
      },
    };
  });
  await page.goto("/");
  await page.locator("#paste").fill(MSG);
  await page.getByRole("button", { name: /Fill this message/ }).click();
  const overlay = page.getByRole("dialog", { name: "Getting the on-device model ready" });
  await expect(overlay).toBeVisible();
  await expect(overlay.getByTestId("download-pct")).toHaveText("40%");
  await overlay.getByRole("button", { name: /Allow the cloud for this paste instead/ }).click();
  const sheet = page.getByRole("dialog", { name: /Send this one message to the cloud/ });
  await expect(sheet).toContainText("The on-device model isn't ready yet");
  await expect(sheet.getByTestId("consent-text")).toHaveText(MSG);
});

// The emergency switch: with cloud_kill_switch = true in Remote Config the consent sheet offers no Send and the teacher cannot call.
test("kill switch on: consent sheet has no Send button and says the cloud is off", async ({ page }) => {
  await page.route("**/firebaseremoteconfig.googleapis.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", headers: { etag: "test-etag-1", "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS", "access-control-expose-headers": "etag" }, body: JSON.stringify({ state: "UPDATE", templateVersion: "1", entries: { cloud_kill_switch: "true" } }) }),
  );
  const fetched = page.waitForResponse((r) => /firebaseremoteconfig/.test(r.url()) && r.request().method() === "POST");
  await page.goto("/");
  await fetched;
  await page.waitForTimeout(500); // activate
  await page.locator("#paste").fill(MSG);
  await page.getByRole("button", { name: /Fill this message/ }).click();
  const sheet = page.getByRole("dialog", { name: /Send this one message to the cloud/ });
  await expect(sheet.getByTestId("consent-off")).toContainText("The cloud path is off right now");
  await expect(sheet.getByTestId("consent-send")).toHaveCount(0);
  await sheet.getByTestId("consent-decline").click();
  await page.getByRole("button", { name: "Teach this form" }).click();
  await expect(page.getByRole("dialog", { name: "Teach this form" }).getByRole("button", { name: /Send this empty form/ })).toBeDisabled();
});
