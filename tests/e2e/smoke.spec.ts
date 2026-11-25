import { expect, test } from "@playwright/test";

test("home page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Pastewise" })).toBeVisible();
});

test("spike page boots Firebase and exposes its probes", async ({ page }) => {
  await page.goto("/spike/");
  await expect(page.locator("#status")).toHaveText("ready");
  expect(await page.evaluate(() => typeof window.__pwSpike?.fillOnDevice)).toBe("function");
});

// Paths that never reach the model (safe in any Chrome profile: no Fill with a valid paste,
// so no on-device model download can start from this test).
test("fill screen: empty and over-long pastes are refused before any model call; ledger starts at 0", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("ledger-bytes")).toHaveText("0 bytes found");
  await page.getByRole("button", { name: /Fill this message/ }).click();
  await expect(page.getByRole("status")).toContainText("Paste an order or booking message");
  await page.locator("#paste").fill("x".repeat(2001));
  await page.locator("#paste").press("ControlOrMeta+Enter");
  await expect(page.getByRole("status")).toContainText("That's 2,001 characters; the limit is 2,000");
  await expect(page.getByTestId("ledger-bytes")).toHaveText("0 bytes found");
});

test("fill screen: the three sample forms are real labelled forms", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "C · CONSIGNMENT NOTE" }).click();
  await expect(page.getByLabel("CNEE TEL")).toHaveAttribute("type", "tel");
  await expect(page.getByLabel("SVC")).toBeVisible();
  await page.getByRole("tab", { name: "B · FRONT DESK" }).click();
  await expect(page.getByLabel("Check-in date")).toHaveAttribute("type", "date");
});

test("samples: one click loads a synthetic message and switches to its form", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("sample-S2").click();
  await expect(page.locator("#paste")).toHaveValue(/double room for 3 nights/);
  await expect(page.getByRole("tab", { name: "B · FRONT DESK" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("ledger-bytes")).toHaveText("0 bytes found");
});

test("samples: a message the person pasted is not replaced without a Yes", async ({ page }) => {
  await page.goto("/");
  // wait for hydration: a click before React attaches its handler shows no dialog and leaves the dismiss handler armed
  await page.waitForFunction(() => "__pastewise" in window);
  await page.locator("#paste").fill("Kirim 2 kotak ke Bu Rina, 0812 5550 1188, Jl. Melati 3, Bogor 16111");
  page.once("dialog", (d) => d.dismiss());
  await page.getByTestId("sample-S2").click();
  await expect(page.locator("#paste")).toHaveValue(/Bu Rina/);
  page.once("dialog", (d) => d.accept());
  await page.getByTestId("sample-S2").click();
  await expect(page.locator("#paste")).toHaveValue(/double room for 3 nights/);
  // switching between samples asks nothing
  await page.getByTestId("sample-S3").click();
  await expect(page.locator("#paste")).toHaveValue(/ceramic mug set/);
});

// Unplug must fail, in the browser: Nano is "available" but the model call dies. The page must say so, fill nothing and send nothing.
test("unplug: the on-device model dies mid-fill -> a visible failure, every box stays empty, nothing is sent", async ({ page }) => {
  const ai: string[] = [];
  page.on("request", (r) => /firebasevertexai|generativelanguage/.test(r.url()) && ai.push(r.url()));
  await page.addInitScript(() => {
    (globalThis as unknown as { LanguageModel: unknown }).LanguageModel = {
      availability: async () => "available",
      params: async () => ({ defaultTopK: 3, maxTopK: 8, defaultTemperature: 1, maxTemperature: 2 }),
      create: async () => ({
        prompt: async () => {
          throw new Error("UnpluggedError: model removed");
        },
        promptStreaming: () => {
          throw new Error("UnpluggedError: model removed");
        },
        destroy() {},
        inputUsage: 0,
        inputQuota: 9000,
      }),
    };
  });
  await page.goto("/");
  await page.getByTestId("sample-S3").click();
  await page.getByRole("button", { name: /Fill this message/ }).click();
  await expect(page.getByText("the on-device model failed — try again").first()).toBeVisible({ timeout: 40_000 });
  for (const id of ["name", "phone", "street", "city"]) await expect(page.locator(`#A-${id}`)).toHaveValue("");
  expect(ai).toEqual([]);
});

// Control for the unplug test above: the same stand-in model, plugged in (it answers with valid JSON), fills the boxes.
test("unplug control: the same stand-in model, answering, fills the boxes it is given", async ({ page }) => {
  await page.addInitScript(() => {
    const answer = JSON.stringify({ name: "Budi Santoso", phone: "081255507734", street: "Jl. Diponegoro 88", city: "Semarang", province: "Jawa Tengah", postal_code: "50241", item: "ceramic mug set", quantity: "1", notes: "Gift wrap please" });
    (globalThis as unknown as { LanguageModel: unknown }).LanguageModel = {
      availability: async () => "available",
      params: async () => ({ defaultTopK: 3, maxTopK: 8, defaultTemperature: 1, maxTemperature: 2 }),
      create: async () => ({ prompt: async () => answer, promptStreaming: () => { throw new Error("not used"); }, destroy() {}, inputUsage: 0, inputQuota: 9000 }),
    };
  });
  await page.goto("/");
  await page.getByTestId("sample-S3").click();
  await page.getByRole("button", { name: /Fill this message/ }).click();
  await expect(page.locator("#A-phone")).toHaveValue("081255507734", { timeout: 40_000 });
  await expect(page.locator("#A-city")).toHaveValue("Semarang");
});
