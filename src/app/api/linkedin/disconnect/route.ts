import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionCompany } from "@/lib/session";

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  const company = await getSessionCompany();
  if (!company) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (body?.confirmed !== true) return NextResponse.json({ error: "Confirmez le retrait de LinkedIn." }, { status: 400 });
  await prisma.$transaction([
    prisma.channelConnection.deleteMany({ where: { companyId: company.id, channel: "linkedin" } }),
    prisma.linkedInAuthorization.deleteMany({ where: { companyId: company.id } }),
  ]);
  return NextResponse.json({ disconnected: true, revoked: false });
}