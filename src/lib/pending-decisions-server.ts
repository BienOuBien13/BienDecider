import { prisma } from "@/lib/prisma";
import { facebookConnectionView } from "@/lib/oauth/meta";
import { countPendingDecisions } from "@/lib/pending-decisions";

/** Nombre de productions à décider, pour le menu de toutes les pages connectées. */
export async function getPendingDecisionCount(companyId: string) {
  const [proposals, facebookConnection] = await Promise.all([
    prisma.agentProposal.findMany({
      where: { companyId, status: { in: ["en_attente", "publication_incertaine", "validee", "modifiee"] } },
      select: { status: true, kind: true },
    }),
    prisma.channelConnection.findUnique({ where: { companyId_channel: { companyId, channel: "facebook" } } }),
  ]);
  const facebook = facebookConnectionView(facebookConnection ?? undefined, companyId);
  return countPendingDecisions(proposals, facebook.status === "connected" ? facebook.pageName : null);
}
