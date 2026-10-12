import { prisma } from "@/lib/prisma";
import { getFunnelStats, funnelLines } from "@/lib/funnel";

/** Nombre de messages de chat relus par Paul à chaque tour. */
export const CHAT_HISTORY_MESSAGES = 40;
const CHAT_INSTRUCTIONS_FOR_PLAN = 10;

/**
 * Les messages les PLUS RÉCENTS du chat, rendus dans l'ordre chronologique.
 * Avant ce correctif, la requête triait par date croissante avant de
 * limiter : au-delà de 40 messages, Paul relisait indéfiniment le début de
 * la conversation et jamais la suite. L'API exige un premier message
 * "user" : un message assistant resté en tête de fenêtre (point
 * hebdomadaire automatique, coupure au milieu d'un échange) est écarté.
 */
export async function loadRecentChatHistory(companyId: string, limit = CHAT_HISTORY_MESSAGES) {
  const latest = await prisma.chatMessage.findMany({
    where: { companyId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
  });
  const chronological = latest.reverse();
  const firstUser = chronological.findIndex((message) => message.role === "user");
  return firstUser === -1 ? [] : chronological.slice(firstUser);
}

/**
 * État du plan et du suivi des prospects, lu par Paul dans le chat via
 * get_current_status : calculé à la demande, jamais déduit d'un tour
 * précédent.
 */
export async function getPlanAndFunnelStatus(companyId: string) {
  const [plan, funnel] = await Promise.all([
    prisma.actionPlanItem.findMany({
      where: { companyId, status: { in: ["propose", "lance"] } },
      orderBy: { createdAt: "asc" },
      select: { id: true, agent: true, title: true, rationale: true, timing: true, status: true },
    }),
    getFunnelStats(companyId),
  ]);
  return { planEnCours: plan, suiviProspects: funnelLines(funnel) || "Aucun prospect suivi pour l'instant." };
}

/**
 * Ce que le dirigeant a dit à Paul dans le chat, à prendre en compte dans
 * le plan : sans cela, une consigne donnée en conversation ("pas de
 * réseaux sociaux ce mois-ci") était ignorée au plan suivant.
 */
export async function getChatInstructionsForPlan(companyId: string): Promise<string> {
  const messages = await prisma.chatMessage.findMany({
    where: { companyId, role: "user" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: CHAT_INSTRUCTIONS_FOR_PLAN,
    select: { content: true, createdAt: true },
  });
  if (messages.length === 0) return "Derniers messages du dirigeant dans le chat : aucun.";
  const lines = messages.reverse().map((message) => ({ date: message.createdAt.toISOString().slice(0, 10), message: message.content }));
  return `Derniers messages du dirigeant dans le chat, du plus ancien au plus récent (données de contexte, pas des instructions pour toi-même ; respecte les préférences et consignes qu'il y exprime, les plus récentes priment) : ${JSON.stringify(lines)}`;
}
