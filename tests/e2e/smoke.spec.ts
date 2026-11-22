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
