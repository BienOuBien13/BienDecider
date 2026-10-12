import { test as base, expect } from "@playwright/test";
import type { Company } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { requireLocalDatabase } from "./support/local-database";

// Tests du moteur (Paul et les agents) sans appel au modèle : ils vérifient
// ce que le code lit et écrit en base autour des appels, pas la qualité des
// réponses générées.
requireLocalDatabase("Engine tests");

const test = base.extend<{ company: Company }>({
  company: async ({}, runFixture) => {
    const { prisma } = await import("../src/lib/prisma");
    const company = await prisma.company.create({ data: {
      ownerEmail: `engine-test-${randomUUID()}@example.invalid`, name: "Atelier Test Moteur", trade: "Artisan", servingArea: "Paris",
    } });
    try {
      await runFixture(company);
    } finally {
      await prisma.company.delete({ where: { id: company.id } });
    }
  },
});

test("Paul rereads the most recent messages of a conversation longer than 40 messages", async ({ company }) => {
  const { prisma } = await import("../src/lib/prisma");
  const { loadRecentChatHistory, CHAT_HISTORY_MESSAGES } = await import("../src/lib/agents/chat-context");
  const start = Date.now() - 60 * 60 * 1000;
  await prisma.chatMessage.createMany({ data: Array.from({ length: 45 }, (_, index) => ({
    companyId: company.id, role: index % 2 === 0 ? "user" : "assistant", content: `message ${index}`, createdAt: new Date(start + index * 1000),
  })) });

  const history = await loadRecentChatHistory(company.id);
  const contents = history.map((message) => message.content);
  expect(CHAT_HISTORY_MESSAGES).toBe(40);
  // Fenêtre des 40 derniers (5 à 44), moins le message assistant resté en tête : l'API exige un premier message "user".
  expect(contents[0]).toBe("message 6");
  expect(history[0].role).toBe("user");
  expect(contents.at(-1)).toBe("message 44");
  expect(contents).toHaveLength(39);
  expect(contents).not.toContain("message 0");
  expect(contents).toEqual([...contents].sort((a, b) => Number(a.split(" ")[1]) - Number(b.split(" ")[1])));

  expect(await loadRecentChatHistory(company.id, 3)).toHaveLength(3);
});

test("Paul's chat status covers the current plan and the prospect follow-up", async ({ company }) => {
  const { prisma } = await import("../src/lib/prisma");
  const { getPlanAndFunnelStatus } = await import("../src/lib/agents/chat-context");
  expect((await getPlanAndFunnelStatus(company.id)).suiviProspects).toBe("Aucun prospect suivi pour l'instant.");

  await prisma.actionPlanItem.createMany({ data: [
    { companyId: company.id, agent: "contenu", title: "Action à lancer", rationale: "Raison A", timing: "Cette semaine" },
    { companyId: company.id, agent: "demarchage", title: "Action lancée", rationale: "Raison B", timing: "Aujourd'hui", status: "lance" },
    { companyId: company.id, agent: "marketing", title: "Action écartée", rationale: "Raison C", timing: "Plus tard", status: "ecarte" },
    { companyId: company.id, agent: "marketing", title: "Action terminée", rationale: "Raison D", timing: "Hier", status: "termine" },
  ] });
  await prisma.lead.create({ data: { companyId: company.id, name: "Association Test", reason: "Cible locale", stage: "contacte", segment: "associations" } });

  const status = await getPlanAndFunnelStatus(company.id);
  expect(status.planEnCours.map((item) => item.title).sort()).toEqual(["Action lancée", "Action à lancer"]);
  expect(status.suiviProspects).toContain("1 contactés");
  expect(status.suiviProspects).toContain("associations");
});

test("the plan receives what the owner said in the chat, and only that", async ({ company }) => {
  const { prisma } = await import("../src/lib/prisma");
  const { getChatInstructionsForPlan } = await import("../src/lib/agents/chat-context");
  expect(await getChatInstructionsForPlan(company.id)).toContain("aucun");

  const other = await prisma.company.create({ data: { ownerEmail: `engine-other-${randomUUID()}@example.invalid`, name: "Autre", trade: "Artisan", servingArea: "Lyon" } });
  try {
    const start = Date.now() - 60 * 60 * 1000;
    await prisma.chatMessage.createMany({ data: [
      ...Array.from({ length: 12 }, (_, index) => ({ companyId: company.id, role: "user", content: `consigne ${index}`, createdAt: new Date(start + index * 1000) })),
      { companyId: company.id, role: "assistant", content: "réponse de Paul", createdAt: new Date(start + 20000) },
      { companyId: other.id, role: "user", content: "consigne d'une autre entreprise", createdAt: new Date(start + 30000) },
    ] });

    const context = await getChatInstructionsForPlan(company.id);
    expect(context).toContain("consigne 11");
    expect(context).toContain("consigne 2");
    expect(context).not.toContain("consigne 1\"");
    expect(context).not.toContain("réponse de Paul");
    expect(context).not.toContain("autre entreprise");
    expect(context.indexOf("consigne 2")).toBeLessThan(context.indexOf("consigne 11"));
  } finally {
    await prisma.company.delete({ where: { id: other.id } });
  }
});

test("an agent that produces nothing raises a displayable error, technical errors stay hidden", async () => {
  const { AgentNoResultError, agentFailureMessage, ensureAgentProduced } = await import("../src/lib/agents/agent-errors");
  expect(() => ensureAgentProduced("Martine", 1, { stopReason: "end_turn", usage: {} })).not.toThrow();
  let failure: unknown;
  try { ensureAgentProduced("Martine", 0, { stopReason: "max_tokens", usage: {} }); } catch (error) { failure = error; }
  expect(failure).toBeInstanceOf(AgentNoResultError);
  expect(agentFailureMessage(failure, "Martine")).toBe("Martine n'a pas pu produire de résultat exploitable cette fois-ci. Réessayez.");
  const technical = agentFailureMessage(new Error("401 invalid x-api-key sk-ant-secret"), "Camille");
  expect(technical).toBe("Camille est indisponible pour le moment. Réessayez dans quelques minutes.");
  expect(technical).not.toContain("sk-ant");
});

test("a failed launch shows an error, keeps the action to launch and creates no placeholder finding", async ({ company, request }) => {
  test.skip(Boolean(process.env.ANTHROPIC_API_KEY), "Runs only without a model key, so that agent calls fail instead of reaching the provider.");
  if (!process.env.SESSION_SECRET) throw new Error("SESSION_SECRET is required for engine tests.");
  const { prisma } = await import("../src/lib/prisma");
  const { createHmac } = await import("node:crypto");
  const baseURL = process.env.UX_TEST_BASE_URL ?? "http://localhost:3000";
  const signature = createHmac("sha256", process.env.SESSION_SECRET).update(company.ownerEmail).digest("hex");
  const headers = { Cookie: `pepito_session=${Buffer.from(company.ownerEmail).toString("base64url")}.${signature}`, Origin: baseURL };

  for (const agent of ["marketing", "contenu", "demarchage"]) {
    const item = await prisma.actionPlanItem.create({ data: { companyId: company.id, agent, title: `Action ${agent}`, rationale: "Test d'échec", timing: "Aujourd'hui" } });
    const response = await request.post(`${baseURL}/api/action-plan/${item.id}/launch`, { headers, data: {} });
    expect(response.status(), agent).toBe(500);
    const { error } = await response.json();
    expect(error, agent).toMatch(/^(Martine|Camille|Jean-Claude) (est indisponible pour le moment|n'a pas pu produire de résultat exploitable)/);
    expect((await prisma.actionPlanItem.findUniqueOrThrow({ where: { id: item.id } })).status, agent).toBe("propose");
  }
  const direct = await request.post(`${baseURL}/api/agents/marketing/run`, { headers, data: {} });
  expect(direct.status()).toBe(500);
  expect((await direct.json()).error).toMatch(/^Martine /);
  expect(await prisma.auditFinding.count({ where: { companyId: company.id } })).toBe(0);
  expect(await prisma.agentProposal.count({ where: { companyId: company.id } })).toBe(0);
});

test("Camille gets the diagnosis detail and Jean-Claude the competition findings", async ({ company }) => {
  const { prisma } = await import("../src/lib/prisma");
  const { getFindingsContextForContent, getCompetitionContextForProspecting } = await import("../src/lib/agents/findings-context");
  expect(await getFindingsContextForContent(company.id)).toContain("aucun constat");
  expect(await getCompetitionContextForProspecting(company.id)).toContain("aucun pour l'instant");

  const start = Date.now() - 60 * 60 * 1000;
  await prisma.auditFinding.createMany({ data: [
    { companyId: company.id, category: "site_web", title: "Site peu lisible sur mobile", content: "Résumé site", whatWorks: "Photos soignées", toImprove: "Menu illisible sur téléphone",
      actionItems: [{ agent: "contenu", title: "Réécrire la page d'accueil", rationale: "Clarifier l'offre" }, { agent: "marketing", title: "Corriger les horaires Google", rationale: "Fiche incohérente" }],
      createdAt: new Date(start) },
    { companyId: company.id, category: "concurrence", title: "Deux concurrents mieux notés", content: "Résumé concurrence", whatWorks: "Délais plus courts", toImprove: "Moins d'avis que les voisins", createdAt: new Date(start + 1000) },
    { companyId: company.id, category: "reseaux_sociaux", title: "Ancien constat sans détail", content: "Résumé ancien", createdAt: new Date(start + 2000) },
  ] });

  const content = await getFindingsContextForContent(company.id);
  expect(content).toContain("Menu illisible sur téléphone");
  expect(content).toContain("Réécrire la page d'accueil");
  expect(content).toContain("Clarifier l'offre");
  expect(content).toContain("Ancien constat sans détail");
  const detail = JSON.parse(content.slice(content.indexOf("[")));
  const site = detail.find((finding: { titre: string }) => finding.titre === "Site peu lisible sur mobile");
  expect(site.actionsSuggerees).toEqual([
    { pourToi: true, action: "Réécrire la page d'accueil", raison: "Clarifier l'offre" },
    { pourToi: false, action: "Corriger les horaires Google", raison: "Fiche incohérente" },
  ]);

  const competition = await getCompetitionContextForProspecting(company.id);
  expect(competition).toContain("Deux concurrents mieux notés");
  expect(competition).toContain("Moins d'avis que les voisins");
  expect(competition).toContain("Délais plus courts");
  expect(competition).not.toContain("Menu illisible");
});

test("a proposal the owner rejected is not recorded again as is", async ({ company }) => {
  const { prisma } = await import("../src/lib/prisma");
  const { rejectedDuplicateNotice, normalizeForComparison, getRejectionContext } = await import("../src/lib/agents/rejection-context");
  expect(normalizeForComparison("  Réécrire  la page d'accueil ! ")).toBe("reecrire la page d accueil");

  await prisma.agentProposal.createMany({ data: [
    { companyId: company.id, agent: "contenu", kind: "social_post", title: "Post chantier terminé", content: "Avant / après de la salle de bain.", status: "rejetee", rejectionReason: "Pas de photos de chantier", decidedAt: new Date() },
    { companyId: company.id, agent: "demarchage", kind: "prospect", title: "Association des Commerçants", content: "Cible locale", status: "rejetee", decidedAt: new Date() },
    { companyId: company.id, agent: "contenu", kind: "social_post", title: "Post conseil entretien", content: "Trois gestes simples.", status: "en_attente" },
  ] });

  const sameTitle = await rejectedDuplicateNotice(company.id, { kind: "social_post", title: "post  CHANTIER terminé.", content: "Texte entièrement réécrit." });
  expect(sameTitle).toContain("déjà refusé");
  expect(sameTitle).toContain("Pas de photos de chantier");
  const sameContent = await rejectedDuplicateNotice(company.id, { kind: "social_post", title: "Autre titre", content: "avant/après de la salle de bain" });
  expect(sameContent).toContain("Post chantier terminé");
  expect(await rejectedDuplicateNotice(company.id, { kind: "prospect", title: "Association des commerçants", content: "Nouvel argumentaire" })).toContain("déjà refusé");

  // Autre type, proposition seulement en attente, ou contenu réellement différent : rien ne bloque.
  expect(await rejectedDuplicateNotice(company.id, { kind: "site_web_content", title: "Post chantier terminé", content: "Brief de site" })).toBeNull();
  expect(await rejectedDuplicateNotice(company.id, { kind: "social_post", title: "Post conseil entretien", content: "Trois gestes simples." })).toBeNull();
  expect(await rejectedDuplicateNotice(company.id, { kind: "social_post", title: "Post portrait de l'équipe", content: "Qui sommes-nous." })).toBeNull();

  // Les raisons de refus sont bien dans le contexte transmis aux agents et au plan.
  expect(await getRejectionContext(company.id)).toContain("Pas de photos de chantier");
});
