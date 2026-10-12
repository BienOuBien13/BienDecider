import { NextRequest, NextResponse } from "next/server";
import { runDemarchageAgent } from "@/lib/agents/demarchage";
import { getSessionCompany } from "@/lib/session";
import { agentFailureMessage } from "@/lib/agents/agent-errors";
import { PERSONAS } from "@/lib/agents/personas";

export async function POST(request: NextRequest) {
  const company = await getSessionCompany();
  if (!company) {
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  }
  const { prospectDescription } = await request.json();

  try {
    const proposals = await runDemarchageAgent(company.id, prospectDescription);
    return NextResponse.json(proposals, { status: 201 });
  } catch (error) {
    console.error("Erreur agent demarchage:", error);
    return NextResponse.json({ error: agentFailureMessage(error, PERSONAS.demarchage.name) }, { status: 500 });
  }
}
