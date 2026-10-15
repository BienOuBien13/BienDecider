import { NextResponse } from "next/server";
import { listAgentRuns } from "@/lib/agent-runs";
import { getSessionCompany } from "@/lib/session";

export async function GET() {
  const company = await getSessionCompany();
  if (!company) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  return NextResponse.json({ runs: await listAgentRuns(company.id) });
}