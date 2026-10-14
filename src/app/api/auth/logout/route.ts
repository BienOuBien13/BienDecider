import { NextRequest, NextResponse } from "next/server";
import { clearSession } from "@/lib/session";

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Origine refusée" }, { status: 403 });
  }
  await clearSession();
  return NextResponse.redirect(new URL("/login", request.url));
}
