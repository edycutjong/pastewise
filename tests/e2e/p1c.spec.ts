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
  await expect(sheet).toContainText("also carries this form's field names and our reading instructions");
  // focus lands on the safe button, so a held Enter from the shortcut can never press Send
  await expect(sheet.getByTestId("consent-decline")).toBeFocused();
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
  await expect(page.getByRole("heading", { name: "Bench", exact: true })).toBeVisible();
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
  await page.keyboard.press("Escape"); // the progress screen cannot be dismissed by accident
  await expect(overlay).toBeVisible();
  await overlay.getByRole("button", { name: /Use the cloud for this paste instead/ }).click();
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

test("first run: a model that fails to start shows the reason and offers retry or the cloud, sending nothing", async ({ page }) => {
  const aiRequests: string[] = [];
  page.on("request", (r) => /firebasevertexai|generativelanguage/.test(r.url()) && aiRequests.push(r.url()));
  await page.addInitScript(() => {
    (globalThis as unknown as { LanguageModel: unknown }).LanguageModel = {
      availability: async () => "downloadable",
      create: async () => {
        await new Promise((r) => setTimeout(r, 200));
        throw new Error("disk full");
      },
    };
  });
  await page.goto("/");
  await page.locator("#paste").fill(MSG);
  await page.getByRole("button", { name: /Fill this message/ }).click();
  const overlay = page.getByRole("dialog", { name: "Getting the on-device model ready" });
  await expect(overlay.getByTestId("download-failed")).toContainText("didn't get ready");
  await expect(overlay.getByRole("button", { name: "Close" })).toBeVisible();
  await overlay.getByRole("button", { name: "Close" }).click();
  await expect(overlay).toBeHidden();
  expect(aiRequests).toEqual([]);
  await expect(page.getByRole("button", { name: /Fill this message/ })).toBeEnabled();
});

// The Yes, end to end with a stand-in cloud: a double click is ONE request, the badge says IN_CLOUD, the receipt counts the
// message once, and a successful send must not leave the "Nothing was sent" notice behind (regression: the dialog's own close event).
test("consent Yes: one request for a double click, IN_CLOUD badge, bytes counted once, no false 'nothing was sent'", async ({ page }) => {
  const answer = { name: "Tia Ramadhani", phone: "081300001111", street: "Jl. Kopo 9", city: "Bandung", province: "Jawa Barat", postal_code: "40222", item: "notebooks", quantity: "2", notes: "" };
  let calls = 0;
  // stand-in App Check: the debug provider (never bundled) with its token exchange answered locally
  await page.addInitScript(() => {
    (globalThis as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = "00000000-0000-4000-8000-000000000000";
  });
  await page.route("**/content-firebaseappcheck.googleapis.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS" }, body: JSON.stringify({ token: "stand-in", ttl: "3600s" }) }),
  );
  await page.route("**/firebasevertexai.googleapis.com/**", async (route) => {
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    calls++;
    await new Promise((r) => setTimeout(r, 400));
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: cors,
      body: JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify(answer) }] }, finishReason: "STOP" }] }),
    });
  });
  await page.goto("/");
  await page.locator("#paste").fill(MSG);
  await page.getByRole("button", { name: /Fill this message/ }).click();
  const sheet = page.getByRole("dialog", { name: /Send this one message to the cloud/ });
  const send = sheet.getByTestId("consent-send");
  await send.dblclick();
  await expect(sheet).toBeHidden({ timeout: 15000 });
  expect(calls).toBe(1);
  await expect(page.locator(".badge")).toHaveText("in_cloud");
  await expect(page.getByTestId("consent-bytes").locator("b")).toHaveText(`${new TextEncoder().encode(MSG).length} bytes`);
  await expect(page.locator("#A-name")).toHaveValue("Tia Ramadhani");
  await expect(page.getByText("Nothing was sent.")).toHaveCount(0);
  // the Yes total lives with the request records: /receipt (client navigation, same page session) shows the same number
  await page.getByRole("link", { name: "Receipt", exact: true }).first().click();
  await expect(page).toHaveURL(/\/receipt\/?$/);
  await expect(page.getByTestId("consent-bytes").locator("b")).toHaveText(`${new TextEncoder().encode(MSG).length} bytes`);
});

test("consent Yes that fails: the sheet says so, a new Yes is needed, and declining does not claim nothing was sent", async ({ page }) => {
  await page.addInitScript(() => {
    (globalThis as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = "00000000-0000-4000-8000-000000000000";
  });
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS" };
  await page.route("**/content-firebaseappcheck.googleapis.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify({ token: "stand-in", ttl: "3600s" }) }),
  );
  let calls = 0;
  await page.route("**/firebasevertexai.googleapis.com/**", (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    calls++;
    return route.fulfill({ status: 500, contentType: "application/json", headers: cors, body: JSON.stringify({ error: { code: 500, message: "stand-in failure" } }) });
  });
  await page.goto("/");
  await page.locator("#paste").fill(MSG);
  await page.getByRole("button", { name: /Fill this message/ }).click();
  const sheet = page.getByRole("dialog", { name: /Send this one message to the cloud/ });
  await sheet.getByTestId("consent-send").click();
  await expect(sheet.getByTestId("consent-failed")).toBeVisible({ timeout: 20000 });
  await expect(sheet.getByTestId("consent-send")).toBeEnabled();
  expect(calls).toBeGreaterThan(0);
  await sheet.getByTestId("consent-decline").click();
  await expect(page.getByRole("status").filter({ hasText: "may still have reached the cloud" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Fill this message/ })).toBeEnabled();
});

test("after a fill, 'Copy for a spreadsheet' puts a header row + values on the clipboard and names the boxes still amber", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  // the model answers with the sender's name and no phone; the gate keeps the name amber (always) and the phone stays empty
  const answer = { name: "Tia Ramadhani", phone: "", street: "Jl. Kopo 9", city: "Bandung", province: "Jawa Barat", postal_code: "40222", item: "notebooks", quantity: "2", notes: "" };
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS" };
  await page.addInitScript(() => {
    (globalThis as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = "00000000-0000-4000-8000-000000000000";
  });
  await page.route("**/content-firebaseappcheck.googleapis.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify({ token: "stand-in", ttl: "3600s" }) }),
  );
  await page.route("**/firebasevertexai.googleapis.com/**", (route) =>
    route.request().method() === "OPTIONS"
      ? route.fulfill({ status: 204, headers: cors })
      : route.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify(answer) }] }, finishReason: "STOP" }] }) }),
  );
  await page.goto("/");
  await expect(page.getByTestId("copy-row")).toHaveCount(0);
  await page.locator("#paste").fill(MSG);
  await page.getByRole("button", { name: /Fill this message/ }).click();
  const sheet = page.getByRole("dialog", { name: /Send this one message to the cloud/ });
  await sheet.getByTestId("consent-send").click();
  await expect(sheet).toBeHidden({ timeout: 15000 });
  await page.getByTestId("copy-row").click();
  await expect(page.getByTestId("copy-status")).toContainText("Still amber, copied as it stands: Recipient name");
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  const [head, row] = clip.split("\n");
  expect(head.split("\t")[0]).toBe("Recipient name");
  expect(row.split("\t")).toContain("Bandung");
  expect(row.split("\t")[0]).toBe("Tia Ramadhani");
  // editing a box hides the old status: the clipboard no longer matches the boxes
  await page.locator("#A-city").fill("Bandung Kota");
  await expect(page.getByTestId("copy-status")).toHaveCount(0);
});
