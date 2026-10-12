import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runMarketingAgent } from "@/lib/agents/marketing";
import { runContenuAgent } from "@/lib/agents/contenu";
import { runDemarchageAgent } from "@/lib/agents/demarchage";
import { getSessionCompany } from "@/lib/session";
import { agentFailureMessage } from "@/lib/agents/agent-errors";
import { PERSONAS } from "@/lib/agents/personas";

/**
 * Lance l'agent correspondant à une action du plan de Paul, EN LUI PASSANT
 * L'ACTION COMME BRIEF (titre + justification). Avant ce correctif, l'agent
 * était lancé à vide et proposait autre chose que ce que Paul avait décidé.
 * Les propositions créées sont rattachées à l'action (planItemId).
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const company = await getSessionCompany();
  if (!company) {
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  }

  const { id } = await params;
  const item = await prisma.actionPlanItem.findUnique({ where: { id } });
  if (!item || item.companyId !== company.id) {
    return NextResponse.json({ error: "Action introuvable" }, { status: 404 });
  }
  if (item.status !== "propose") {
    return NextResponse.json({ error: "Action déjà lancée ou écartée" }, { status: 409 });
  }

  const options = {
    brief: `${item.title} — ${item.rationale}`,
    planItemId: item.id,
  };

  try {
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
        const proposals = await runContenuAgent(item.companyId, undefined, options);
        producedCount = proposals.length;
        pendingValidation = proposals.length;
        break;
      }
      case "demarchage": {
        const proposals = await runDemarchageAgent(item.companyId, undefined, options);
        producedCount = proposals.length;
        pendingValidation = proposals.length;
        break;
      }
      default:
        return NextResponse.json({ error: `Agent inconnu : ${item.agent}` }, { status: 400 });
    }

    const nextStatus: "lance" | "termine" = pendingValidation > 0 ? "lance" : "termine";

    const updated = await prisma.actionPlanItem.update({
      where: { id },
      data: { status: nextStatus },
    });
    return NextResponse.json({ item: updated, producedCount });
  } catch (error) {
    console.error("Erreur lancement action du plan:", error);
    // Le statut n'est pas modifié : l'action reste "à lancer" et peut être relancée telle quelle.
    const agentName = PERSONAS[item.agent as "marketing" | "contenu" | "demarchage"]?.name ?? "L'agent";
    return NextResponse.json({ error: agentFailureMessage(error, agentName) }, { status: 500 });
  }
}
