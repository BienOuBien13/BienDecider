import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PublishRefusedError, publishSiteFromProposal } from "@/lib/site/publish";
import { getSessionCompany } from "@/lib/session";

/**
 * Exécution réelle d'une proposition VALIDÉE. Aujourd'hui une seule
 * exécution existe : publier le site d'une page. Les autres types
 * (fiche Google, posts) attendent les connexions OAuth — cf. docs/backlog.md.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (_request.headers.get("origin") !== _request.nextUrl.origin) {
    return NextResponse.json({ error: "Origine refusée" }, { status: 403 });
  }

  const company = await getSessionCompany();
  if (!company) {
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  }

  const { id } = await params;
  const proposal = await prisma.agentProposal.findUnique({ where: { id } });
  if (!proposal || proposal.companyId !== company.id) {
    return NextResponse.json({ error: "Proposition introuvable" }, { status: 404 });
  }

  // Confirmer l'exécution d'une version précise : une ancienne page ouverte ne peut pas publier une version remplacée.
  const body = await _request.json().catch(() => null);
  const expectedVersion = body && typeof body === "object" ? (body as { expectedVersion?: unknown }).expectedVersion : undefined;
  if (!Number.isInteger(expectedVersion)) {
    return NextResponse.json({ error: "La version à publier est obligatoire." }, { status: 400 });
  }

  try {
    const { slug } = await publishSiteFromProposal(id, expectedVersion as number);
    return NextResponse.json({ url: `/site/${slug}` });
  } catch (error) {
    console.error("Erreur exécution proposition:", error);
    if (error instanceof PublishRefusedError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Échec de l'exécution";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
