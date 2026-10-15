import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionEmail } from "@/lib/session";
import { AppShell } from "@/components/app-shell";
import { omitPasswordHash } from "@/lib/safe-company";
import { DashboardClient } from "./dashboard-client";
import { getConfiguredRiskLevels } from "@/lib/delegation-policy";
import { facebookConnectionView } from "@/lib/oauth/meta";
import { countPendingDecisions } from "@/lib/pending-decisions";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const ownerEmail = await getSessionEmail();
  if (!ownerEmail) redirect("/login");

  const company = await prisma.company.findUnique({ where: { ownerEmail } });
  if (!company || !company.name) redirect("/onboarding");

  const [planItems, recentAgentRuns, proposals, diagnosticCount, riskSettings, facebookConnection] = await Promise.all([
    prisma.actionPlanItem.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: "asc" },
      include: {
        proposals: { orderBy: { createdAt: "desc" } },
        agentRuns: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, agent: true, planItemId: true, status: true, attempts: true, maxDurationSeconds: true, queuedAt: true, startedAt: true, finishedAt: true, resultCount: true, errorMessage: true } },
      },
    }),
    prisma.agentRun.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, agent: true, planItemId: true, status: true, attempts: true, maxDurationSeconds: true, queuedAt: true, startedAt: true, finishedAt: true, resultCount: true, errorMessage: true },
    }),
    prisma.agentProposal.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.auditFinding.count({ where: { companyId: company.id } }),
    getConfiguredRiskLevels(),
    prisma.channelConnection.findUnique({ where: { companyId_channel: { companyId: company.id, channel: "facebook" } } }),
  ]);
  // Seul le nom de la Page connectée est transmis au navigateur, jamais un jeton.
  const facebook = facebookConnectionView(facebookConnection ?? undefined, company.id);
  const facebookPageName = facebook.status === "connected" ? facebook.pageName : null;

  return (
    <AppShell companyName={company.name} pendingCount={countPendingDecisions(proposals, facebookPageName)}>
      <DashboardClient
        company={omitPasswordHash(company)}
        initialPlanItems={planItems}
        initialAgentRuns={recentAgentRuns}
        initialProposals={proposals}
        initialDiagnosticCount={diagnosticCount}
        riskSettings={riskSettings}
        facebookPageName={facebookPageName}
        initialView={view === "validation" || view === "historique" ? view : "plan"}
      />
    </AppShell>
  );
}
