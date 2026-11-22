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
