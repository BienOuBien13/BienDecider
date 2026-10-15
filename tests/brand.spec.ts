import { test, expect } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Loading from "../src/app/loading";
import ErrorPage from "../src/app/error";

const baseURL = process.env.UX_TEST_BASE_URL ?? "http://localhost:3000";

test("loading and error states are French and do not expose technical details", () => {
  const loading = renderToStaticMarkup(createElement(Loading));
  expect(loading).toContain('role="status"');
  expect(loading).toContain("Chargement en cours");
  expect(loading).toContain("Retour à l&#x27;accueil");
  const props = { error: Object.assign(new Error("private-database-credentials"), { digest: "private-digest" }), retry: () => {} };
  for (const component of [ErrorPage]) {
    const html = renderToStaticMarkup(createElement(component, props));
    expect(html).toContain("Réessayer");
    expect(html).toContain('href="/"');
    expect(html).not.toContain("private-database-credentials");
    expect(html).not.toContain("private-digest");
  }
});

test("unknown pages offer a French return route on desktop and mobile", async ({ page }, testInfo) => {
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const response = await page.goto(`${baseURL}/page-inexistante-test-96`);
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Page introuvable", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Retour à l'accueil", exact: true })).toHaveAttribute("href", "/");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`not-found-${width}.png`), fullPage: true });
  }
  await page.getByRole("link", { name: "Retour à l'accueil", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: /BienDecider prépare le travail/ })).toBeVisible();
});

test("BienDecider public identity, metadata, contact and responsive pages", async ({ page }, testInfo) => {
  await page.goto(baseURL);
  await expect(page).toHaveTitle("BienDecider");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.getByRole("heading", { level: 1, name: /BienDecider prépare le travail/ })).toBeVisible();
  await expect(page.getByText("BienDecider", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Créer mon compte", exact: true })).toHaveAttribute("href", "/signup");
  await expect(page.getByRole("link", { name: "J'ai déjà un compte", exact: true })).toHaveAttribute("href", "/login");
  await expect(page.getByText("Exemple fictif, aucune donnée client")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/gratuit pendant le pilote/i);
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
test("login and signup fields have permanent labels, autocomplete and a password toggle", async ({ page }) => {
  for (const [path, autocomplete] of [["/login", "current-password"], ["/signup", "new-password"]] as const) {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto(`${baseURL}${path}`);
    const email = page.getByLabel("Adresse e-mail", { exact: true });
    const password = page.getByLabel("Mot de passe", { exact: true });
    await expect(email).toHaveAttribute("autocomplete", "email");
    await expect(password).toHaveAttribute("autocomplete", autocomplete);
    await password.fill("secret-test");
    await expect(password).toHaveAttribute("type", "password");
    await page.getByLabel("Afficher le mot de passe", { exact: true }).check();
    await expect(password).toHaveAttribute("type", "text");
    await expect(password).toHaveValue("secret-test");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test("the privacy policy distinguishes processing from publication and is reachable without a session", async ({ page }) => {
  await page.goto(`${baseURL}/confidentialite#traitement`);
  await expect(page.getByRole("heading", { name: "Sous-traitants et destinataires" })).toBeVisible();
  await expect(page.locator("main")).toContainText("Traitement et publication sont deux choses distinctes");
  await expect(page.locator("body")).not.toContainText("Rien n'est partagé");
});
