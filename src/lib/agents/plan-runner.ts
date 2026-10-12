import type { ActionPlanItem } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runMarketingAgent } from "@/lib/agents/marketing";
import { runContenuAgent } from "@/lib/agents/contenu";
import { runDemarchageAgent } from "@/lib/agents/demarchage";
import { statusAfterRun, type PlanAgent } from "@/lib/agents/plan-items";

/**
 * Lance l'agent d'une action du plan EN LUI PASSANT L'ACTION COMME BRIEF
 * (titre + justification) et rattache ses propositions à l'action. Chemin
 * unique pour le bouton "Lancer" du plan et pour les délégations de Paul
 * dans le chat. En cas d'échec de l'agent, l'erreur remonte et le statut
 * n'est pas modifié : l'action reste "à lancer".
 */
export async function runPlanItem(
  item: Pick<ActionPlanItem, "id" | "companyId" | "title" | "rationale"> & { agent: PlanAgent },
  extras: { newsContext?: string; prospectDescription?: string } = {},
) {
  const options = { brief: `${item.title} — ${item.rationale}`, planItemId: item.id };
  let producedCount = 0;
  // Seules les PROPOSITIONS nécessitent une validation (affichées sous
  // l'action dans le dashboard) — les constats d'audit sont informatifs,
  // pas une raison de garder l'action en "lancé" indéfiniment.
  let pendingValidation = 0;

  switch (item.agent) {
    case "marketing": {
      const { findings, proposals } = await runMarketingAgent(item.companyId, options);
      producedCount = findings.length + proposals.length;
      pendingValidation = proposals.length;
      break;
    }
    case "contenu": {
      const proposals = await runContenuAgent(item.companyId, extras.newsContext, options);
      producedCount = proposals.length;
      pendingValidation = proposals.length;
      break;
    }
    case "demarchage": {
      const proposals = await runDemarchageAgent(item.companyId, extras.prospectDescription, options);
      producedCount = proposals.length;
      pendingValidation = proposals.length;
      break;
    }
  }

  const updated = await prisma.actionPlanItem.update({
    where: { id: item.id },
    data: { status: statusAfterRun(pendingValidation) },
  });
  return { item: updated, producedCount, pendingValidation };
}
