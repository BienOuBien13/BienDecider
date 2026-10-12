import { NextResponse } from "next/server";
import { runMarketingAgent } from "@/lib/agents/marketing";
import { getSessionCompany } from "@/lib/session";
import { agentFailureMessage } from "@/lib/agents/agent-errors";
import { PERSONAS } from "@/lib/agents/personas";

export async function POST() {
  const company = await getSessionCompany();
  if (!company) {
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  }

  try {
    const { findings, proposals } = await runMarketingAgent(company.id);
    return NextResponse.json({ findings, proposals }, { status: 201 });
  } catch (error) {
    console.error("Erreur agent marketing:", error);
    return NextResponse.json({ error: agentFailureMessage(error, PERSONAS.marketing.name) }, { status: 500 });
  }
}
