import { prisma } from "@/lib/prisma";
import { isActionDone } from "@/lib/proposal-progress";

/** Aligne l'état d'une action du plan sur ses productions : terminée seulement si tout est décidé et réalisé. */
export async function syncPlanItemStatus(planItemId: string) {
  const proposals = await prisma.agentProposal.findMany({ where: { planItemId }, select: { status: true, kind: true } });
  if (isActionDone(proposals)) {
    await prisma.actionPlanItem.updateMany({ where: { id: planItemId, status: "lance" }, data: { status: "termine" } });
  } else {
    await prisma.actionPlanItem.updateMany({ where: { id: planItemId, status: "termine" }, data: { status: "lance" } });
  }
}
