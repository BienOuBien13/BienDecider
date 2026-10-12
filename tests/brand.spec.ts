import { test, expect } from "@playwright/test";

const baseURL = process.env.UX_TEST_BASE_URL ?? "http://localhost:3000";

test("BienDecider public identity, metadata, contact and responsive pages", async ({ page }, testInfo) => {
  await page.goto(baseURL);
  await expect(page).toHaveTitle("BienDecider");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.getByRole("heading", { name: "BienDecider", exact: true })).toBeVisible();
  await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute("content", "BienDecider");
  await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute("content", "fr_FR");
  await expect(page.getByRole("link", { name: "Contact", exact: true })).toHaveAttribute("href", "mailto:contact@biendecider.com");
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/", "/login", "/signup", "/cgu", "/confidentialite", "/mentions-legales"]) {
      await page.goto(`${baseURL}${path}`);
      await expect(page.locator("h1")).toBeVisible();
      await expect(page).toHaveTitle("BienDecider");
      await expect(page.locator("body")).not.toContainText("Pepito");
      await expect(page.locator("body")).not.toContainText(/\S+@gmail\.com/);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    await page.goto(baseURL);
    await page.screenshot({ path: testInfo.outputPath(`brand-${width}.png`), fullPage: true });
  }
  for (const path of ["/cgu", "/confidentialite", "/mentions-legales"]) {
    await page.goto(`${baseURL}${path}`);
    await expect(page.locator("main").getByRole("link", { name: "contact@biendecider.com", exact: true }).first()).toHaveAttribute("href", "mailto:contact@biendecider.com");
  }
  await page.goto(`${baseURL}/login`);
  await expect(page.getByRole("link", { name: "Créer un compte", exact: true })).toHaveAttribute("href", "/signup");
  await page.goto(`${baseURL}/signup`);
  await expect(page.getByRole("heading", { name: "Créer un compte", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Se connecter", exact: true })).toHaveAttribute("href", "/login");
});