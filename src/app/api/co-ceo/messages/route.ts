import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionCompany } from "@/lib/session";
import { resolvePaulReferences } from "@/lib/paul-references";

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
  const messages = latest.reverse();
  const assistantMessages = messages.filter((message) => message.role === "assistant");
  const resolved = await resolvePaulReferences(company.id, assistantMessages.map((message) => message.content));
  let resolvedIndex = 0;
  return NextResponse.json(messages.map((message) => message.role === "assistant"
    ? { ...message, ...resolved[resolvedIndex++] }
    : { ...message, references: [] }));
}
