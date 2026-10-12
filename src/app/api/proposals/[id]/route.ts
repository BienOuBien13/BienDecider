import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionCompany } from "@/lib/session";

const ALLOWED_STATUSES = ["validee", "modifiee", "rejetee"] as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const company = await getSessionCompany();
  if (!company) {
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.agentProposal.findUnique({ where: { id } });
  if (!existing || existing.companyId !== company.id) {
    return NextResponse.json({ error: "Proposition introuvable" }, { status: 404 });
  }

  const body = await request.json();
  const { status, content } = body;

  if (!ALLOWED_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `status doit être l'un de : ${ALLOWED_STATUSES.join(", ")}` },
      { status: 400 },
    );
  }
  if (status === "modifiee" && (typeof content !== "string" || !content.trim())) {
    return NextResponse.json({ error: "Le contenu modifié ne peut pas être vide" }, { status: 400 });
  }

  // Décision humaine actée ici — aucune exécution réelle déclenchée
  // automatiquement (cf. docs/architecture-technique.md § Flux de validation).
  const proposal = await prisma.agentProposal.update({
    where: { id },
    data: {
      status,
      content: status === "modifiee" ? content.trim() : undefined,
      decidedAt: new Date(),
    },
  });

  // Un prospect validé entre dans le funnel de prospection (cf. src/lib/funnel.ts) ;
  // rejeté, il en sort sans être supprimé (trace pour la boucle d'apprentissage).
  if (existing.kind === "prospect") {
    await prisma.lead.updateMany({
      where: { proposalId: id, stage: { in: ["propose", "a_contacter", "ecarte"] } },
      data: { stage: status === "rejetee" ? "ecarte" : "a_contacter" },
    });
  }

  // Lisibilité plan → propositions : quand toutes les propositions d'une
  // action du plan sont décidées, l'action passe "terminée" d'elle-même.
  if (proposal.planItemId) {
    const remaining = await prisma.agentProposal.count({
      where: { planItemId: proposal.planItemId, status: "en_attente" },
    });
    if (remaining === 0) {
      await prisma.actionPlanItem.update({
        where: { id: proposal.planItemId },
        data: { status: "termine" },
      });
    }
  }

  return NextResponse.json(proposal);
}
