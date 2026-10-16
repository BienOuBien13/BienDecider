import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionEmail } from "@/lib/session";
import { readJsonObject } from "@/lib/request-body";

/**
 * Décision du dirigeant : laisser Pepito prendre contact lui-même avec les
 * prospects validés (défaut : non). Même pattern que /api/companies/direction.
 * L'exécution réelle reste gardée par l'absence de fournisseur d'envoi
 * (cf. src/lib/outreach.ts) — ce réglage capture la décision, pas l'action.
 */
export async function POST(request: NextRequest) {
  const ownerEmail = await getSessionEmail();
  if (!ownerEmail) {
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  }
  const enabled = (await readJsonObject(request))?.enabled;
  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "enabled (booléen) requis" }, { status: 400 });
  }

  const company = await prisma.company.update({
    where: { ownerEmail },
    data: { autoOutreachEnabled: enabled },
  });
  return NextResponse.json({ autoOutreachEnabled: company.autoOutreachEnabled });
}
