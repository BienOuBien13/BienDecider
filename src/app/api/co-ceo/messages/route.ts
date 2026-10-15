import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionCompany } from "@/lib/session";

export async function GET() {
  const company = await getSessionCompany();
  if (!company) {
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  }

  const latest = await prisma.chatMessage.findMany({
    where: { companyId: company.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 50,
  });
  return NextResponse.json(latest.reverse());
}
