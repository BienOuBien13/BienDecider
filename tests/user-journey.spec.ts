import { test as base, expect } from "@playwright/test";
import { PrismaClient, type Company } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createHmac, randomUUID } from "node:crypto";
import { config } from "dotenv";
import { encryptGmailToken } from "../src/lib/oauth/gmail";
import { companyProfileLines, objectiveLine } from "../src/lib/agents/personas";
import { getRejectionContext } from "../src/lib/agents/rejection-context";

config({ quiet: true });

const baseURL = process.env.UX_TEST_BASE_URL ?? "http://localhost:3000";
const adminFixture = process.env.ADMIN_UI_TEST === "1";
const test = base.extend<{ company: Company }>({
  company: async ({ page }, runFixture) => {
    if (!process.env.DATABASE_URL || !process.env.SESSION_SECRET) throw new Error("DATABASE_URL and SESSION_SECRET are required for UX tests.");
    // Ces tests écrivent en base : refus par défaut de toute base non locale, pour ne jamais viser celle du prototype par erreur.
    const databaseHost = new URL(process.env.DATABASE_URL).hostname;
    if (!["localhost", "127.0.0.1", "[::1]"].includes(databaseHost) && process.env.UX_TEST_ALLOW_REMOTE_DB !== "1") {
      throw new Error("UX tests refuse a non-local DATABASE_URL. Set UX_TEST_ALLOW_REMOTE_DB=1 only for a dedicated development database, never the prototype one.");
    }
    const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
    const ownerEmail = adminFixture
      ? "ux-admin-settings-test@example.invalid"
      : `ux-test-${randomUUID()}@example.invalid`;
    if (process.env.ADMIN_UI_TEST === "1") await prisma.company.deleteMany({ where: { ownerEmail } });
    const company = await prisma.company.create({ data: {
      ownerEmail, name: "Atelier Test Parcours", trade: "Artisan", servingArea: "Paris",
      objective: "Développer les demandes de devis", monthlyRevenue: 4000, revenueTarget: 6000, averageClientValue: 500,
      description: "Artisan de proximité", phone: "0100000000", certifications: "Label de test", openingHours: "Lundi au vendredi",
    } });
    try {
      const encoded = Buffer.from(ownerEmail).toString("base64url");
      const signature = createHmac("sha256", process.env.SESSION_SECRET).update(ownerEmail).digest("hex");
      await page.context().addCookies([{ name: "pepito_session", value: `${encoded}.${signature}`, url: baseURL, httpOnly: true, sameSite: "Lax" }]);
      await page.route("**/api/agents/**", (route) => route.fulfill({ status: 503, json: { error: "Agent indisponible pour le test" } }));
      await runFixture(company);
    } finally {
      await prisma.company.delete({ where: { id: company.id } });
      await prisma.$disconnect();
    }
  },
});

test("Gmail compose requires confirmation and handles uncertain sends", async ({ page, company }, testInfo) => {
  test.skip(process.env.GMAIL_UI_TEST !== "1", "Requires the isolated Gmail UI test server with dummy credentials.");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    process.env.OAUTH_TOKEN_ENCRYPTION_KEY = "c".repeat(64);
    await prisma.channelConnection.create({ data: {
      companyId: company.id, channel: "gmail", status: "connecte",
      accessToken: encryptGmailToken("dummy-access", company.id),
      refreshToken: encryptGmailToken(JSON.stringify({ token: "dummy-refresh", email: "sender@example.invalid" }), company.id),
      expiresAt: new Date(Date.now() + 3600000),
    } });
    const requestId = randomUUID();
    const message = { to: "recipient@example.invalid", subject: "Message déjà traité", text: "Contenu confirmé", confirmed: true, requestId };
    await prisma.agentProposal.create({ data: {
      id: `gmail-${requestId}`, companyId: company.id, agent: "contenu", kind: "gmail_email", title: message.subject,
      content: JSON.stringify({ to: message.to, text: message.text }), status: "executee",
    } });
    const repeated = await page.request.post(`${baseURL}/api/gmail/send`, { headers: { Origin: baseURL }, data: message });
    expect(repeated.status()).toBe(200);
    expect(await repeated.json()).toEqual({ sent: true });
    const changed = await page.request.post(`${baseURL}/api/gmail/send`, { headers: { Origin: baseURL }, data: { ...message, text: "Autre contenu" } });
    expect(changed.status()).toBe(409);
    const unconfirmed = await page.request.post(`${baseURL}/api/gmail/send`, { headers: { Origin: baseURL }, data: { ...message, confirmed: false } });
    expect(unconfirmed.status()).toBe(400);
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto(`${baseURL}/connexions`);
    await expect(page.getByText("sender@example.invalid", { exact: true })).toBeVisible();
    await expect(page.locator("main")).not.toContainText("dummy-access");
    await page.getByText("Écrire un email", { exact: true }).click();
    await page.getByLabel("Destinataire", { exact: true }).fill("recipient@example.invalid");
    await page.getByLabel("Objet", { exact: true }).fill("Test manuel");
    await page.getByLabel("Message", { exact: true }).fill("Contenu confirmé");
    await expect(page.getByText("Risque élevé · communication externe non rappelable.", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Envoyer avec Gmail" })).toBeDisabled();
    await page.getByLabel("Je confirme le destinataire et le contenu de cet envoi.").check();
    let firstId: string | undefined;
    await page.route("**/api/gmail/send", async (route) => {
      const body = route.request().postDataJSON();
      expect(body.confirmed).toBe(true);
      expect(body.to).toBe("recipient@example.invalid");
      expect(body.text).toBe("Contenu confirmé");
      if (firstId) expect(body.requestId).toBe(firstId);
      firstId = body.requestId;
      await route.fulfill({ status: 502, json: { error: "Résultat incertain. Vérifiez Gmail." } });
    });
    await page.getByRole("button", { name: "Envoyer avec Gmail" }).click();
    await expect(page.locator("main").getByRole("alert")).toContainText("Résultat incertain");
    await page.getByRole("button", { name: "Envoyer avec Gmail" }).click();
    await expect(page.locator("main").getByRole("alert")).toContainText("Résultat incertain");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("gmail-compose-mobile.png"), fullPage: true });
    await page.getByLabel("Objet", { exact: true }).fill("Objet modifié");
    await expect(page.getByRole("button", { name: "Envoyer avec Gmail" })).toBeDisabled();
    await page.unroute("**/api/gmail/send");
    await page.route("**/api/gmail/send", (route) => route.fulfill({ json: { sent: true } }));
    await page.getByLabel("Je confirme le destinataire et le contenu de cet envoi.").check();
    await page.getByRole("button", { name: "Envoyer avec Gmail" }).click();
    await expect(page.locator("main").getByRole("status")).toContainText("confirmé l'envoi");
    await expect(page.getByLabel("Message", { exact: true })).toHaveValue("");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: testInfo.outputPath("gmail-compose-desktop.png"), fullPage: true });
  } finally { await prisma.$disconnect(); }
});

test("Gmail start, refusal and send guards do not contact providers", async ({ page, company }) => {
  expect(company.id).toBeTruthy();
  await page.goto(`${baseURL}/connexions`);
  await expect(page.getByRole("heading", { name: "Gmail · envoi de messages" })).toBeVisible();
  const start = await page.request.get(`${baseURL}/api/oauth/gmail/start`, { maxRedirects: 0 });
  expect(start.status()).toBe(307);
  const location = start.headers().location;
  if (location.includes("accounts.google.com")) {
    const authorization = new URL(location);
    expect(authorization.searchParams.get("scope")?.split(" ")).toEqual(["https://www.googleapis.com/auth/gmail.send", "openid", "email"]);
    expect(authorization.searchParams.get("redirect_uri")).toBe(`${baseURL}/api/oauth/gmail/callback`);
    expect(authorization.searchParams.get("code_challenge_method")).toBe("S256");
    await page.goto(`${baseURL}/api/oauth/gmail/callback?state=${authorization.searchParams.get("state")}&error=access_denied`);
    await expect(page).toHaveURL(/error=gmail_denied/);
  } else {
    expect(location).toContain("error=gmail_config");
  }
  await page.goto(`${baseURL}/api/oauth/gmail/callback?state=invalid&code=not-a-real-code`);
  await expect(page).toHaveURL(/error=gmail_state/);
  const denied = await page.request.post(`${baseURL}/api/gmail/send`, { headers: { Origin: "https://untrusted.example" }, data: {} });
  expect(denied.status()).toBe(403);
  const missingConnection = await page.request.post(`${baseURL}/api/gmail/send`, {
    headers: { Origin: baseURL }, data: { to: "recipient@example.invalid", subject: "Test", text: "Test", confirmed: true, requestId: randomUUID() },
  });
  expect([409, 503]).toContain(missingConnection.status());
});

test("risk policy API rejects non-admin sessions", async ({ page }) => {
  test.skip(process.env.ADMIN_UI_TEST === "1", "Run with the normal local environment to test a non-admin session.");
  const get = await page.request.get(`${baseURL}/api/admin/delegation-risk`);
  expect(get.status()).toBe(403);
  const patch = await page.request.patch(`${baseURL}/api/admin/delegation-risk`, {
    headers: { Origin: baseURL }, data: { actionKind: "piste_croissance", riskLevel: "eleve" },
  });
  expect(patch.status()).toBe(403);
});

test("OAuth authorization is not advertised as a verified business connection", async ({ page, company }, testInfo) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    await prisma.channelConnection.createMany({ data: [
      { companyId: company.id, channel: "google_business_profile", status: "connecte", accessToken: "test-token-never-visible", expiresAt: new Date(Date.now() - 60000) },
      { companyId: company.id, channel: "facebook", status: "connecte", accessToken: "test-token-never-visible", expiresAt: new Date(Date.now() + 3600000) },
      { companyId: company.id, channel: "instagram", status: "erreur" },
    ] });
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${baseURL}/connexions`);
      await expect(page.getByText("Autorisation expirée", { exact: true })).toBeVisible();
      await expect(page.getByText("Autorisation enregistrée · compte à vérifier", { exact: true })).toBeVisible();
      await expect(page.getByText("Erreur d'autorisation", { exact: true })).toBeVisible();
      await expect(page.locator("main")).not.toContainText("test-token-never-visible");
      await expect(page.getByText("Connecté", { exact: true })).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`oauth-${width}.png`), fullPage: true });
    }
    await prisma.channelConnection.deleteMany({ where: { companyId: company.id } });
    await page.reload();
    await expect(page.locator("main ul").getByText("Non autorisé", { exact: true })).toHaveCount(3);
  } finally { await prisma.$disconnect(); }
});

test("growth journey shows progress, the current step and can be hidden and restored", async ({ page, company }) => {
  expect(company.name).toBe("Atelier Test Parcours");
  await page.goto(`${baseURL}/dashboard`);
  const journey = page.getByRole("region", { name: "Votre parcours" });
  await expect(journey.getByRole("heading", { name: "Votre parcours" })).toBeVisible();
  await expect(journey.getByRole("progressbar", { name: "Avancement du parcours" })).toHaveAttribute("aria-valuenow", "1");
  await expect(journey.getByText("Étape 2 sur 5 · Diagnostic")).toBeVisible();
  await expect(journey.getByRole("link", { name: "Lancer le diagnostic" })).toHaveAttribute("href", "/diagnostic");

  await journey.getByRole("button", { name: "Masquer le parcours" }).click();
  await expect(journey.getByText("Parcours 1/5 étapes terminées")).toBeVisible();
  await journey.getByRole("button", { name: "Afficher le parcours" }).click();
  await expect(journey.getByRole("heading", { name: "Votre parcours" })).toBeVisible();
});

test("proposal can be edited and saved as the approved version without executing it", async ({ page, company }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  const updatedContent = "Texte corrigé par le dirigeant avant validation.";
  let proposalId = "";
  try {
    const proposal = await prisma.agentProposal.create({ data: {
      companyId: company.id,
      agent: "contenu",
      kind: "social_post",
      title: "Publication à corriger",
      content: "Version initiale à corriger.",
    } });
    proposalId = proposal.id;

    await page.goto(`${baseURL}/dashboard?view=validation`);
    const card = page.locator("article").filter({ hasText: proposal.title });
    await card.getByRole("button", { name: "Modifier", exact: true }).click();
    await card.getByRole("textbox", { name: "Modifier le contenu" }).fill(updatedContent);
    await card.getByRole("button", { name: "Enregistrer et valider la version", exact: true }).click();

    await expect(card.getByText("Modifiée", { exact: true })).toBeVisible();
    expect((await prisma.agentProposal.findUniqueOrThrow({ where: { id: proposal.id } })).content).toBe(updatedContent);
    expect(await prisma.executionLog.count({ where: { proposalId: proposal.id } })).toBe(0);
  } finally {
    if (proposalId) await prisma.agentProposal.deleteMany({ where: { id: proposalId } });
    await prisma.$disconnect();
  }
});

test("single validation queue, persistent decisions, publishing and error recovery", async ({ page, company }, testInfo) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    const item = await prisma.actionPlanItem.create({ data: { companyId: company.id, agent: "contenu", title: "Préparer la communication", rationale: "Attirer des demandes qualifiées", timing: "Cette semaine", status: "lance" } });
    await prisma.agentProposal.createMany({ data: [
      { companyId: company.id, planItemId: item.id, agent: "contenu", kind: "social_post", title: "Publication issue du plan", content: "Contenu du plan" },
      { companyId: company.id, agent: "contenu", kind: "social_post", title: "Demande manuelle", content: "Contenu manuel" },
      { companyId: company.id, agent: "contenu", kind: "site_web_content", title: "Site approuvé à publier", content: "Contenu du site", status: "validee" },
    ] });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${baseURL}/dashboard`);
    await expect(page.getByRole("heading", { name: "Préparer la communication" })).toBeVisible();
    await expect(page.locator("article")).toHaveCount(0);
    await page.getByRole("link", { name: "À valider 3", exact: true }).click();
    await expect(page.locator("article")).toHaveCount(3);
    await expect(page.getByText("Risque élevé", { exact: true })).toHaveCount(3);
    await expect(page.getByText("Risque modéré", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Risque élevé", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("toute action réelle reste soumise à votre validation.", { exact: true })).toHaveCount(0);
    await page.locator("article summary").filter({ hasText: "Risque élevé" }).first().click();
    await expect(page.getByText("Dans ce prototype, toute action réelle reste soumise à votre validation.", { exact: true }).first()).toBeVisible();
    await expect(page.locator("article").filter({ hasText: "Publication issue du plan" }).getByText("Exposition publique", { exact: true })).toBeVisible();
    const unapprovedSite = await prisma.agentProposal.create({ data: {
      companyId: company.id, agent: "contenu", kind: "site_web_content", title: "Site encore en attente", content: "Proposition non validée",
    } });
    const crossOriginAttempt = await page.request.post(`${baseURL}/api/proposals/${unapprovedSite.id}/execute`, { headers: { Origin: "https://untrusted.example" } });
    expect(crossOriginAttempt.status()).toBe(403);
    const bypassAttempt = await page.request.post(`${baseURL}/api/proposals/${unapprovedSite.id}/execute`, { headers: { Origin: baseURL } });
    expect(bypassAttempt.status()).toBe(400);
    expect(await prisma.executionLog.count({ where: { proposalId: unapprovedSite.id } })).toBe(0);
    await prisma.agentProposal.delete({ where: { id: unapprovedSite.id } });
    const manual = page.locator("article").filter({ hasText: "Demande manuelle" });
    await page.route("**/api/proposals/*", async (route) => {
      if (route.request().method() === "PATCH") await route.fulfill({ status: 500, json: { error: "Décision non enregistrée" } });
      else await route.continue();
    });
    await manual.getByRole("button", { name: "Valider", exact: true }).click();
    await expect(page.locator("main").getByRole("alert")).toHaveText("Décision non enregistrée");
    await expect(manual.getByRole("button", { name: "Valider", exact: true })).toBeEnabled();
    await page.unroute("**/api/proposals/*");
    await manual.getByRole("button", { name: "Valider", exact: true }).click();
    await expect(manual.getByText("Validée", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "À valider 2", exact: true })).toBeVisible();
    await expect(manual).toBeVisible();
    const planned = page.locator("article").filter({ hasText: "Publication issue du plan" });
    await planned.getByRole("button", { name: "Rejeter", exact: true }).click();
    await planned.getByRole("button", { name: "Confirmer le rejet", exact: true }).click();
    await expect(planned.getByText("Rejetée", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "À valider 1", exact: true })).toBeVisible();
    const site = await prisma.agentProposal.findFirstOrThrow({ where: { companyId: company.id, kind: "site_web_content" } });
    await page.route(`**/api/proposals/${site.id}/execute`, async (route) => {
      await prisma.agentProposal.update({ where: { id: site.id }, data: { status: "executee" } });
      await route.fulfill({ json: { url: "/site/test" } });
    });
    await page.getByRole("button", { name: "Publier le site" }).click();
    await expect(page.locator("article").filter({ hasText: site.title }).getByText("Réalisée", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "À valider 0", exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("validation-desktop.png"), fullPage: true });
    await page.reload();
    await expect(page.getByText("Tout est à jour.", { exact: false })).toBeVisible();
    await page.getByRole("link", { name: "Voir les résultats", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Résultats", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: site.title })).toBeVisible();
    await expect(page.getByRole("button", { name: "Valider", exact: true })).toHaveCount(0);
    await page.goto(`${baseURL}/equipe`);
    await expect(page.locator("article")).toHaveCount(0);
    await page.getByText("Demande ponctuelle", { exact: true }).first().click();
    await page.getByRole("button", { name: "Confier la demande" }).first().click();
    await expect(page.locator("main").getByRole("alert")).toHaveText("Agent indisponible pour le test");
    await expect(page.getByRole("button", { name: "Confier la demande" }).first()).toBeEnabled();
  } finally { await prisma.$disconnect(); }
});

test("rejection reasons are optional, persisted in history and available to agents", async ({ page, company }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    const proposal = await prisma.agentProposal.create({ data: {
      companyId: company.id, agent: "demarchage", kind: "prospect", title: "Prospect hors cible", content: "Organisation proposée",
    } });
    const lead = await prisma.lead.create({ data: {
      companyId: company.id, proposalId: proposal.id, name: "Prospect hors cible", reason: "Proximité géographique", stage: "propose",
    } });
    const patch = (data: unknown) => page.request.patch(`${baseURL}/api/proposals/${proposal.id}`, { data });
    for (const rejectionReason of ["x".repeat(1001), 42, null]) {
      expect((await patch({ status: "rejetee", rejectionReason })).status()).toBe(400);
    }
    expect((await patch({ status: "validee", rejectionReason: "Pas ma cible" })).status()).toBe(400);
    expect((await prisma.agentProposal.findUniqueOrThrow({ where: { id: proposal.id } })).status).toBe("en_attente");

    await page.goto(`${baseURL}/dashboard?view=validation`);
    const card = page.locator("article").filter({ hasText: proposal.title });
    await card.getByRole("button", { name: "Rejeter", exact: true }).click();
    await card.getByLabel("Raison du rejet (facultative)").fill("Hors de ma zone d'intervention");
    await card.getByRole("button", { name: "Annuler le rejet", exact: true }).click();
    expect((await prisma.agentProposal.findUniqueOrThrow({ where: { id: proposal.id } })).status).toBe("en_attente");

    await card.getByRole("button", { name: "Rejeter", exact: true }).click();
    await card.getByLabel("Raison du rejet (facultative)").fill("  Hors de ma zone d'intervention  ");
    await card.getByRole("button", { name: "Confirmer le rejet", exact: true }).click();
    await expect(card.getByText("Rejetée", { exact: true })).toBeVisible();
    const saved = await prisma.agentProposal.findUniqueOrThrow({ where: { id: proposal.id } });
    expect(saved.rejectionReason).toBe("Hors de ma zone d'intervention");
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).stage).toBe("ecarte");
    expect(await getRejectionContext(company.id)).toContain(saved.rejectionReason!);
    expect(await getRejectionContext("nonexistent-company")).not.toContain(saved.rejectionReason!);

    await page.goto(`${baseURL}/dashboard?view=historique`);
    await page.reload();
    await expect(page.locator("article").filter({ hasText: proposal.title }).getByText("Raison du rejet : Hors de ma zone d'intervention", { exact: true })).toBeVisible();

    const optional = await prisma.agentProposal.create({ data: {
      companyId: company.id, agent: "contenu", kind: "social_post", title: "Refus sans motif", content: "Publication proposée",
    } });
    expect((await page.request.patch(`${baseURL}/api/proposals/${optional.id}`, { data: { status: "rejetee" } })).status()).toBe(200);
    expect((await prisma.agentProposal.findUniqueOrThrow({ where: { id: optional.id } })).rejectionReason).toBeNull();
  } finally {
    await prisma.$disconnect();
  }
});

test("diagnostic to plan, keyboard dialog and responsive navigation", async ({ page, company }, testInfo) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    await prisma.auditFinding.create({ data: {
      companyId: company.id, category: "site_web", title: "Visibilité locale à renforcer", content: "Votre offre pourrait être plus visible.",
      whatWorks: "Une activité bien identifiée", toImprove: "Préciser la zone d'intervention",
      actionItems: [{ agent: "contenu", title: "Clarifier la zone d'intervention", rationale: "Améliorer les demandes locales" }],
    } });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseURL}/diagnostic`);
    await page.getByRole("button", { name: /Visibilité locale à renforcer/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.getByRole("button", { name: /Visibilité locale à renforcer/ }).click();
    await page.getByRole("button", { name: "Ajouter au plan" }).click();
    await expect(page.getByRole("button", { name: /Ajouté/ })).toBeDisabled();
    await page.getByRole("link", { name: "Voir dans le plan d'action" }).click();
    await expect(page.getByRole("heading", { name: "Clarifier la zone d'intervention", exact: true }).last()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("plan-mobile.png"), fullPage: true });
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [path, title] of [
        ["/dashboard", "Aujourd'hui"],
        ["/dashboard?view=validation", "Aujourd'hui"],
        ["/diagnostic", "Diagnostic"],
        ["/equipe", "Équipe"],
        ["/rapport", "Résultats"],
      ]) {
        await page.goto(`${baseURL}${path}`);
        await expect(page.getByRole("heading", { level: 1, name: title, exact: true })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("header summary").click();
    await page.getByRole("link", { name: "Diagnostic", exact: true }).last().click();
    await expect(page.getByRole("heading", { name: "Diagnostic", exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("diagnostic-mobile.png"), fullPage: true });
  } finally { await prisma.$disconnect(); }
});

test("explicit admin can tune global risk level but cannot lower the effective floor", async ({ page, company }) => {
  test.skip(!adminFixture, "Requires an isolated local server with ADMIN_EMAILS for the fixture admin.");
  expect(company.ownerEmail).toBe("ux-admin-settings-test@example.invalid");
  const settings = [{
    kind: "piste_croissance", label: "Piste de croissance", configuredLevel: null,
    minimumLevel: "modere", effectiveLevel: "modere", updatedBy: null, updatedAt: null,
  }];
  await page.route("**/api/admin/delegation-risk", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: settings });
    const input = route.request().postDataJSON();
    expect(input).toEqual({ actionKind: "piste_croissance", riskLevel: "eleve" });
    return route.fulfill({ json: {
      actionKind: input.actionKind, configuredLevel: input.riskLevel, effectiveLevel: "eleve",
      minimumLevel: "modere", updatedBy: "ux-admin-settings-test@example.invalid", updatedAt: new Date().toISOString(),
    } });
  });
  await page.goto(`${baseURL}/admin/risques`);
  await expect(page.getByRole("heading", { name: "Politique de risque des actions" })).toBeVisible();
  const risk = page.getByLabel("Risque pour Piste de croissance");
  await expect(risk).toHaveValue("modere");
  await expect(risk.locator('option[value="faible"]')).toBeDisabled();
  const belowFloor = await page.request.patch(`${baseURL}/api/admin/delegation-risk`, {
    headers: { Origin: baseURL }, data: { actionKind: "site_web_content", riskLevel: "faible" },
  });
  expect(belowFloor.status()).toBe(400);
  await risk.selectOption("eleve");
  await expect(page.getByRole("status")).toContainText("Niveau de risque mis à jour");
  await expect(risk).toHaveValue("eleve");
    await expect(page.getByText("Niveau effectif : Élevé")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const otherContext = await page.context().browser()!.newContext();
  try {
    const otherPage = await otherContext.newPage();
    const otherEmail = "ordinary-pilot@example.invalid";
    const encoded = Buffer.from(otherEmail).toString("base64url");
    const signature = createHmac("sha256", process.env.SESSION_SECRET!).update(otherEmail).digest("hex");
    await otherContext.addCookies([{ name: "pepito_session", value: `${encoded}.${signature}`, url: baseURL, httpOnly: true, sameSite: "Lax" }]);
    const denied = await otherPage.request.get(`${baseURL}/api/admin/delegation-risk`);
    expect(denied.status()).toBe(403);
    const deniedUpdate = await otherPage.request.patch(`${baseURL}/api/admin/delegation-risk`, {
      headers: { Origin: baseURL }, data: { actionKind: "piste_croissance", riskLevel: "eleve" },
    });
    expect(deniedUpdate.status()).toBe(403);
  } finally {
    await otherContext.close();
  }
});

test("clearing optional company profile fields removes them from storage and agent context", async ({ page, company }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  const previousProfile = {
    website: "https://old.example.invalid",
    socialHandles: "@old_profile",
    objective: "Ancien objectif à remplacer",
    description: "Ancienne description de test",
    phone: "+33102030405",
    certifications: "Ancien label de test",
    openingHours: "Anciennes heures de test",
  };

  try {
    await prisma.company.update({ where: { id: company.id }, data: previousProfile });
    await page.goto(`${baseURL}/entreprise`);
    await expect(page.getByPlaceholder("Site web (optionnel — beaucoup de TPE n'en ont pas)")).toHaveValue(previousProfile.website);
    await expect(page.locator('input[placeholder^="Compte Instagram/Facebook"]')).toHaveValue(previousProfile.socialHandles);

    await page.getByPlaceholder("ex: 10 nouveaux clients par mois").fill("");
    await page.locator("textarea").fill("");
    await page.getByPlaceholder("Téléphone affiché aux clients (optionnel)").fill("");
    await page.getByPlaceholder("Certifications / labels (ex: RGE, optionnel)").fill("");
    await page.getByPlaceholder("Horaires d'ouverture (optionnel)").fill("");
    await page.getByPlaceholder("Site web (optionnel — beaucoup de TPE n'en ont pas)").fill("");
    await page.locator('input[placeholder^="Compte Instagram/Facebook"]').fill("");
    await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await expect(page).toHaveURL(`${baseURL}/dashboard`);

    const cleared = await prisma.company.findUniqueOrThrow({ where: { id: company.id } });
    for (const field of Object.keys(previousProfile) as (keyof typeof previousProfile)[]) {
      expect(cleared[field], `${field} should be cleared`).toBeNull();
    }
    const agentContext = `${companyProfileLines(cleared)}\n${objectiveLine(cleared)}`;
    for (const value of Object.values(previousProfile)) {
      expect(agentContext).not.toContain(value);
    }
  } finally {
    await prisma.$disconnect();
  }
});

test("natural-language onboarding previews extracted fields and asks for missing required details one at a time", async ({ page, company }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    await prisma.company.update({ where: { id: company.id }, data: { name: "", trade: "", servingArea: "", objective: null } });
    await page.route("**/api/onboarding/interpret", (route) => route.fulfill({ json: { profile: {
      name: "Atelier Exemple", trade: "Plomberie", servingArea: "", objective: "",
    } } }));

    await page.goto(`${baseURL}/onboarding`);
    const sentencePanel = page.getByRole("region", { name: "Démarrer en une phrase" });
    await sentencePanel.getByLabel("Décrivez votre activité et votre objectif en une phrase").fill("Je suis plombier et je cherche cinq clients par mois.");
    await sentencePanel.getByRole("button", { name: "Préremplir mon profil" }).click();

    await expect(sentencePanel.getByText("Information manquante : zone de chalandise")).toBeVisible();
    await expect(page.getByPlaceholder("Nom commercial")).toHaveValue("Atelier Exemple");
    await expect(page.getByPlaceholder("Votre métier (ex: plombier, restaurant...)")).toHaveValue("Plomberie");
    expect((await prisma.company.findUniqueOrThrow({ where: { id: company.id } })).name).toBe("");

    await sentencePanel.locator("input").fill("Lille et alentours");
    await sentencePanel.getByRole("button", { name: "Continuer", exact: true }).click();
    await expect(sentencePanel.getByText("Information manquante : objectif")).toBeVisible();
    await expect(page.getByPlaceholder("ex: 10 nouveaux clients par mois")).toHaveValue("");
    expect((await prisma.company.findUniqueOrThrow({ where: { id: company.id } })).servingArea).toBe("");

    await sentencePanel.locator("input").fill("Trouver cinq nouveaux clients par mois");
    await sentencePanel.getByRole("button", { name: "Continuer", exact: true }).click();
    await expect(sentencePanel.getByText("Voici ce que j'ai compris. Vérifiez et corrigez les champs avant d'enregistrer.")).toBeVisible();
    expect((await prisma.company.findUniqueOrThrow({ where: { id: company.id } })).name).toBe("");

    await page.getByRole("button", { name: "Valider et lancer mon audit" }).click();
    await expect(page).toHaveURL(`${baseURL}/dashboard`);
    const saved = await prisma.company.findUniqueOrThrow({ where: { id: company.id } });
    expect(saved.name).toBe("Atelier Exemple");
    expect(saved.trade).toBe("Plomberie");
    expect(saved.servingArea).toBe("Lille et alentours");
    expect(saved.objective).toBe("Trouver cinq nouveaux clients par mois");
  } finally {
    await prisma.$disconnect();
  }
});

test("guided onboarding starts with three fields and keeps the full company page available", async ({ page, company }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    await prisma.company.update({ where: { id: company.id }, data: {
      name: "", trade: "", servingArea: "", objective: null, description: null, phone: null,
      certifications: null, openingHours: null, website: null, socialHandles: null,
    } });
    await page.goto(`${baseURL}/onboarding`);
    await expect(page.getByRole("button", { name: "Valider et lancer mon audit" })).toBeEnabled();
    await expect(page.locator("form input")).toHaveCount(3);
    await expect(page.getByPlaceholder("CA mensuel actuel (€)")).toHaveCount(0);
    await page.getByPlaceholder("Nom commercial").fill("Atelier Minimal");
    await page.getByPlaceholder("Votre métier (ex: plombier, restaurant...)").fill("Plomberie");
    await page.getByPlaceholder("Zone de chalandise (ex: Lyon et alentours)").fill("Lille");
    await page.getByRole("button", { name: "Valider et lancer mon audit" }).click();
    await expect(page).toHaveURL(`${baseURL}/dashboard`);
    const saved = await prisma.company.findUniqueOrThrow({ where: { id: company.id } });
    expect(saved.name).toBe("Atelier Minimal");
    expect(saved.trade).toBe("Plomberie");
    expect(saved.servingArea).toBe("Lille");
    expect(saved.objective).toBeNull();
    expect(saved.phone).toBeNull();
    await page.getByRole("link", { name: "Mon entreprise", exact: true }).first().click();
    await expect(page).toHaveURL(`${baseURL}/entreprise`);
    await expect(page.getByRole("heading", { name: "Mon entreprise", exact: true })).toBeVisible();
    await expect(page.getByPlaceholder("Nom commercial")).toHaveValue("Atelier Minimal");
    await expect(page.getByPlaceholder("CA mensuel actuel (€)")).toBeVisible();
    await expect(page.getByPlaceholder("Téléphone affiché aux clients (optionnel)")).toBeVisible();
    await expect(page.getByRole("region", { name: "Démarrer en une phrase" })).toHaveCount(0);
  } finally {
    await prisma.$disconnect();
  }
});

test("agents request only missing profile details and wait for successful partial saving", async ({ page, company }, testInfo) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  let agentCalls = 0;
  try {
    await prisma.company.update({ where: { id: company.id }, data: {
      description: null, phone: null, certifications: null, openingHours: null, website: null,
    } });
    await page.route("**/api/agents/contenu/run", (route) => {
      agentCalls += 1;
      return route.fulfill({ json: { proposals: [] } });
    });
    await page.goto(`${baseURL}/equipe`);
    const camille = page.locator("section").filter({ has: page.getByRole("heading", { name: "Camille", exact: true }) });
    await camille.getByText("Demande ponctuelle", { exact: true }).click();
    await camille.getByRole("button", { name: "Confier la demande" }).click();
    const dialog = page.getByRole("dialog", { name: "Compléments pour Camille" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Objectif principal (facultatif)")).toHaveCount(0);
    await expect(dialog.getByLabel("Site web (facultatif)")).toHaveCount(0);
    expect(agentCalls).toBe(0);
    await page.screenshot({ path: testInfo.outputPath("profile-details-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: testInfo.outputPath("profile-details-mobile.png"), fullPage: true });
    await dialog.getByLabel("Activité et savoir-faire (facultatif)").fill("Dépannage et rénovation");
    await dialog.getByLabel("Téléphone affiché aux clients (facultatif)").fill("0102030405");
    await page.route("**/api/companies", async (route) => {
      if (route.request().method() === "PATCH") await route.fulfill({ status: 500, json: { error: "Compléments non enregistrés" } });
      else await route.continue();
    });
    await dialog.getByRole("button", { name: "Enregistrer et continuer" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Compléments non enregistrés");
    expect(agentCalls).toBe(0);
    await expect(dialog.getByLabel("Téléphone affiché aux clients (facultatif)")).toHaveValue("0102030405");
    await page.unroute("**/api/companies");
    await dialog.getByRole("button", { name: "Enregistrer et continuer" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("status")).toContainText("Demande traitée");
    expect(agentCalls).toBe(1);
    const saved = await prisma.company.findUniqueOrThrow({ where: { id: company.id } });
    expect(saved.description).toBe("Dépannage et rénovation");
    expect(saved.phone).toBe("0102030405");
    expect(saved.monthlyRevenue).toBe(company.monthlyRevenue);
    expect(saved.objective).toBe(company.objective);
    expect(saved.website).toBeNull();
    for (const invalid of [{ phone: 42 }, { phone: "x".repeat(101) }, { companyId: "another-company", phone: "999" }]) {
      expect((await page.request.patch(`${baseURL}/api/companies`, { data: invalid })).status()).toBe(400);
    }
    await camille.getByRole("button", { name: "Confier la demande" }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Téléphone affiché aux clients (facultatif)")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Annuler", exact: true }).click();
    expect(agentCalls).toBe(1);
    await camille.getByRole("button", { name: "Confier la demande" }).click();
    await dialog.getByRole("button", { name: "Continuer sans complément" }).click();
    await expect(page.getByRole("status")).toContainText("Demande traitée");
    expect(agentCalls).toBe(2);
  } finally {
    await prisma.$disconnect();
  }
});