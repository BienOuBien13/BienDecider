import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionEmail } from "@/lib/session";
import { AppShell } from "@/components/app-shell";
import { omitPasswordHash } from "@/lib/safe-company";
import { DashboardClient } from "./dashboard-client";
import { getConfiguredRiskLevels } from "@/lib/delegation-policy";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const ownerEmail = await getSessionEmail();
  if (!ownerEmail) redirect("/login");

  const company = await prisma.company.findUnique({ where: { ownerEmail } });
  if (!company || !company.name) redirect("/onboarding");

  const [planItems, chatMessages, proposals, diagnosticCount, riskSettings] = await Promise.all([
    prisma.actionPlanItem.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: "asc" },
      include: { proposals: { orderBy: { createdAt: "desc" } } },
    }),
    prisma.chatMessage.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.agentProposal.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.auditFinding.count({ where: { companyId: company.id } }),
    getConfiguredRiskLevels(),
  ]);

  return (
    <AppShell companyName={company.name}>
      <DashboardClient
        company={omitPasswordHash(company)}
        initialPlanItems={planItems}
        initialChatMessages={chatMessages}
        initialProposals={proposals}
        initialDiagnosticCount={diagnosticCount}
        riskSettings={riskSettings}
        initialView={view === "validation" || view === "historique" ? view : "plan"}
      />
    </AppShell>
  );
}
