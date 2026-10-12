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
