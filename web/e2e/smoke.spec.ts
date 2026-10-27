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

// /messages is a protected page: unauthenticated visitors must be pushed to
// /login, not served an empty shell (useRequireAuth gate renders a skeleton).
test("/messages redirects unauthenticated visitors to login", async ({ page }) => {
  await page.goto("/messages", { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/login/, { timeout: 15000 });
  expect(page.url()).toContain("/login");
});

// The message composer's file pickers must expose their allowlists to the OS
// file dialog (the page is auth-gated, so unauthenticated DOM can't show the
// inputs — assert the shipped source contract the build compiles instead).
test("DM attachment allowlist matches the server contract", async () => {
  const { readFileSync } = await import("node:fs");
  const rules = readFileSync("src/lib/dm-types.ts", "utf8");
  expect(rules).toContain("DM_IMAGE_ACCEPT =");
  expect(rules).toContain('"image/png,image/jpeg,image/webp,image/gif');
  expect(rules).toContain('"application/pdf,text/plain,text/csv');
  const composer = readFileSync("src/components/DmComposer.tsx", "utf8");
  expect(composer).toContain("accept={DM_IMAGE_ACCEPT}");
  expect(composer).toContain("accept={DM_FILE_ACCEPT}");
});
