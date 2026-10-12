import { NextRequest, NextResponse } from "next/server";
import { runContenuAgent } from "@/lib/agents/contenu";
import { getSessionCompany } from "@/lib/session";
import { agentFailureMessage } from "@/lib/agents/agent-errors";
import { PERSONAS } from "@/lib/agents/personas";

export async function POST(request: NextRequest) {
  const company = await getSessionCompany();
  if (!company) {
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  }
  const { newsContext } = await request.json();

  try {
    const proposals = await runContenuAgent(company.id, newsContext);
    return NextResponse.json(proposals, { status: 201 });
  } catch (error) {
    console.error("Erreur agent contenu:", error);
    return NextResponse.json({ error: agentFailureMessage(error, PERSONAS.contenu.name) }, { status: 500 });
  }
}
