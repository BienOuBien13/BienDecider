import { NextRequest, NextResponse } from "next/server";
import { runCoCeoTurn } from "@/lib/agents/co-ceo";
import { AgentRunQuotaError, reserveUsageBudget } from "@/lib/agent-runs";
import { getSessionCompany } from "@/lib/session";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const company = await getSessionCompany();
  if (!company) {
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  }
  const { message } = await request.json();
  if (!message) {
    return NextResponse.json({ error: "message requis" }, { status: 400 });
  }

  try {
    const reservation = await reserveUsageBudget(company.id, "co_ceo_chat");
    const reply = await runCoCeoTurn(company.id, message, reservation.id);
    return NextResponse.json({ reply });
  } catch (error) {
    if (error instanceof AgentRunQuotaError) return NextResponse.json({ error: error.message }, { status: 429 });
    console.error("Erreur Co-CEO:", error);
    return NextResponse.json({ error: "Échec de la réponse" }, { status: 500 });
  }
}
