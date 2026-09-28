import { test, expect } from "@playwright/test";

// Minimal smoke coverage: the public login page must serve and render.
// Kept content-agnostic on purpose — it guards boot/routing, not copy.
test("login page serves over HTTP", async ({ request }) => {
  const res = await request.get("/login");
  expect(res.status()).toBe(200);
});

test("login page renders in chromium", async ({ page }) => {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#email")).toBeVisible();
  await expect(page.locator("#password")).toBeVisible();
  await expect(page.locator('button[type="submit"]')).toBeVisible();
});
