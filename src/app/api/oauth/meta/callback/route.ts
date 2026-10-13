import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionCompany } from "@/lib/session";
import { encryptFacebookAccount, exchangeMetaCode, MetaOAuthError, META_CALLBACK, META_STATE_COOKIE, verifyMetaState } from "@/lib/oauth/meta";

// Délai laissé au dirigeant pour choisir sa Page après l'autorisation ; au-delà, il recommence.
const PAGE_SELECTION_WINDOW_MS = 30 * 60 * 1000;

export async function GET(request: NextRequest) {
  const store = await cookies();
  const state = store.get(META_STATE_COOKIE)?.value;
  store.set(META_STATE_COOKIE, "", { path: "/api/oauth/meta", maxAge: 0 });
  const company = await getSessionCompany();
  if (!company) return NextResponse.redirect(new URL("/login", request.url));
  const fail = (error: string) => NextResponse.redirect(new URL(`/connexions?error=${error}`, request.url));
  const session = store.get("pepito_session")?.value;
  const redirectUri = new URL(META_CALLBACK, request.url).toString();
  if (!state || !session || state !== request.nextUrl.searchParams.get("state") ||
    !verifyMetaState(state, { companyId: company.id, session, redirectUri })) return fail("meta_state");
  if (request.nextUrl.searchParams.has("error")) return fail("meta_denied");
  const code = request.nextUrl.searchParams.get("code");
  if (!code || code.length > 10000) return fail("meta_state");
  try {
    const { account, expiresAt } = await exchangeMetaCode(code, redirectUri);
    const accessToken = encryptFacebookAccount(account, company.id);
    const selectionDeadline = new Date(Math.min(expiresAt.getTime(), Date.now() + PAGE_SELECTION_WINDOW_MS));
    // Rien n'est déclaré connecté ici : la Page reste à choisir puis à vérifier (cf. /api/facebook/page).
    await prisma.channelConnection.upsert({
      where: { companyId_channel: { companyId: company.id, channel: "facebook" } },
      create: { companyId: company.id, channel: "facebook", status: "selection_requise", accessToken, expiresAt: selectionDeadline },
      update: { status: "selection_requise", accessToken, refreshToken: null, expiresAt: selectionDeadline },
    });
    return NextResponse.redirect(new URL("/connexions?connected=facebook_selection", request.url));
  } catch (error) {
    return fail(error instanceof MetaOAuthError ? error.diagnostic : "meta_storage");
  }
}
