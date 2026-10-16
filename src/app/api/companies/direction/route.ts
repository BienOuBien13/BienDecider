import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionEmail } from "@/lib/session";
import { readJsonObject } from "@/lib/request-body";

/** "Réorienter Paul" : consigne libre du dirigeant, injectée dans le plan et dans tous les agents. */
export async function POST(request: NextRequest) {
  const ownerEmail = await getSessionEmail();
  if (!ownerEmail) {
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  }
  const body = await readJsonObject(request);
  const direction = body?.direction;
  if (typeof direction !== "string" || direction.length > 2000) {
    return NextResponse.json({ error: "direction requise (texte de 2 000 caractères maximum)" }, { status: 400 });
  }

  const company = await prisma.company.update({
    where: { ownerEmail },
    data: { direction: direction.trim() || null },
  });
  return NextResponse.json({ direction: company.direction });
}
