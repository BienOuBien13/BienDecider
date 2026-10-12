import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runPlanItem } from "@/lib/agents/plan-runner";
import { isPlanAgent } from "@/lib/agents/plan-items";
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

  const agent = item.agent;
  if (!isPlanAgent(agent)) {
    return NextResponse.json({ error: `Agent inconnu : ${agent}` }, { status: 400 });
  }

  try {
    const { item: updated, producedCount } = await runPlanItem({ ...item, agent });
    return NextResponse.json({ item: updated, producedCount });
  } catch (error) {
    console.error("Erreur lancement action du plan:", error);
    // Le statut n'est pas modifié : l'action reste "à lancer" et peut être relancée telle quelle.
    return NextResponse.json({ error: agentFailureMessage(error, PERSONAS[agent].name) }, { status: 500 });
  }
}
