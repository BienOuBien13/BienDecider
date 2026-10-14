import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionCompany } from "@/lib/session";

// "brouillon" enregistre une version sans décision ; "validee"/"modifiee"
// approuvent la version courante (avec ou sans nouveau contenu) ; "rejetee" refuse.
const ALLOWED_STATUSES = ["brouillon", "validee", "modifiee", "rejetee"] as const;
type RequestedStatus = (typeof ALLOWED_STATUSES)[number];

const VERSION_CONFLICT = "Cette production a changé depuis son ouverture. Rechargez la page pour voir la dernière version avant de décider.";

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
  const { status, content, rejectionReason, expectedVersion } = body as {
    status: RequestedStatus; content?: unknown; rejectionReason?: unknown; expectedVersion?: unknown;
  };

  if (!ALLOWED_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `status doit être l'un de : ${ALLOWED_STATUSES.join(", ")}` },
      { status: 400 },
    );
  }
  const changesContent = status === "brouillon" || status === "modifiee";
  if (changesContent && (typeof content !== "string" || !content.trim())) {
    return NextResponse.json({ error: "Le contenu modifié ne peut pas être vide" }, { status: 400 });
  }
  if (rejectionReason !== undefined && (status !== "rejetee" || typeof rejectionReason !== "string" || rejectionReason.length > 1000)) {
    return NextResponse.json({ error: "La raison du rejet doit être un texte de 1 000 caractères maximum, uniquement pour un rejet." }, { status: 400 });
  }
  // Écrire ou approuver exige la version vue par le dirigeant : un autre onglet
  // ne peut pas remplacer silencieusement son travail ni faire approuver une version périmée.
  if (status !== "rejetee" && !Number.isInteger(expectedVersion)) {
    return NextResponse.json({ error: "La version attendue est obligatoire." }, { status: 400 });
  }
  if (expectedVersion !== undefined && expectedVersion !== existing.version) {
    return NextResponse.json({ error: VERSION_CONFLICT }, { status: 409 });
  }

  const wasApproved = ["validee", "modifiee"].includes(existing.status);
  if (existing.status === "rejetee" || existing.status === "executee" || (wasApproved && status === "rejetee")) {
    return NextResponse.json({ error: "Cette production est déjà décidée ou réalisée." }, { status: 409 });
  }
  if (wasApproved && existing.kind === "prospect") {
    return NextResponse.json({ error: "Ce prospect est déjà dans votre suivi de prospection." }, { status: 409 });
  }

  const newContent = changesContent ? (content as string).trim() : existing.content;
  const contentChanged = newContent !== existing.content;
  const version = contentChanged ? existing.version + 1 : existing.version;
  const now = new Date();

  if (status === "brouillon" && !contentChanged) {
    return NextResponse.json(existing);
  }

  // Décision humaine actée ici — aucune exécution réelle déclenchée
  // automatiquement (cf. docs/architecture-technique.md § Flux de validation).
  const data =
    status === "brouillon"
      ? // Modifier une version approuvée retire l'approbation : elle redevient à relire.
        { content: newContent, version, status: "en_attente", draftSavedAt: now }
      : status === "rejetee"
        ? { status, rejectionReason: typeof rejectionReason === "string" ? rejectionReason.trim() || null : null, decidedAt: now }
        : {
            content: newContent,
            version,
            status: version > 1 ? "modifiee" : "validee",
            approvedVersion: version,
            approvedAt: now,
            decidedAt: now,
            rejectionReason: null,
          };

  // Mise à jour conditionnée à la version lue : deux écritures concurrentes ne peuvent pas réussir toutes les deux.
  const { count } = await prisma.agentProposal.updateMany({
    where: { id, companyId: company.id, version: existing.version },
    data,
  });
  if (count === 0) {
    return NextResponse.json({ error: VERSION_CONFLICT }, { status: 409 });
  }
  const proposal = await prisma.agentProposal.findUniqueOrThrow({ where: { id } });

  // Un prospect validé entre dans le funnel de prospection (cf. src/lib/funnel.ts) ;
  // rejeté, il en sort sans être supprimé (trace pour la boucle d'apprentissage).
  // Un simple brouillon ne le fait pas avancer.
  if (existing.kind === "prospect" && status !== "brouillon") {
    await prisma.lead.updateMany({
      where: { proposalId: id, stage: { in: ["propose", "a_contacter", "ecarte"] } },
      data: { stage: status === "rejetee" ? "ecarte" : "a_contacter" },
    });
  }

  // Lisibilité plan → propositions : quand toutes les propositions d'une
  // action du plan sont décidées, l'action passe "terminée" d'elle-même ;
  // une version de nouveau à relire la rouvre.
  if (proposal.planItemId) {
    const remaining = await prisma.agentProposal.count({
      where: { planItemId: proposal.planItemId, status: "en_attente" },
    });
    if (remaining === 0) {
      await prisma.actionPlanItem.update({
        where: { id: proposal.planItemId },
        data: { status: "termine" },
      });
    } else if (status === "brouillon") {
      await prisma.actionPlanItem.updateMany({
        where: { id: proposal.planItemId, status: "termine" },
        data: { status: "lance" },
      });
    }
  }

  return NextResponse.json(proposal);
}
