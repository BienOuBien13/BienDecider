import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runCoCeoTurn } from "@/lib/agents/co-ceo";
import { buildPageContext, pageContextSchema } from "@/lib/agents/page-context";
import { AgentRunQuotaError, reserveUsageBudget } from "@/lib/agent-runs";
import { getSessionCompany } from "@/lib/session";

export const maxDuration = 60;

const bodySchema = z.object({
  message: z.string().trim().min(1).max(4000),
  context: pageContextSchema.optional(),
});

export async function POST(request: NextRequest) {
  const company = await getSessionCompany();
  if (!company) {
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Message requis (4 000 caractères au plus)." }, { status: 400 });
  }

  try {
    const pageContext = parsed.data.context ? await buildPageContext(company.id, parsed.data.context) : undefined;
    const reservation = await reserveUsageBudget(company.id, "co_ceo_chat");
    const reply = await runCoCeoTurn(company.id, parsed.data.message, reservation.id, pageContext);
    return NextResponse.json({ reply });
  } catch (error) {
    if (error instanceof AgentRunQuotaError) return NextResponse.json({ error: error.message }, { status: 429 });
    console.error("Erreur Co-CEO:", error);
    return NextResponse.json({ error: "Échec de la réponse" }, { status: 500 });
  }
}
