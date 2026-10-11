import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Sonde de santé publique, sans donnée métier : l'application répond et la
 * base est joignable. `commit` permet au test de fumée post-déploiement de
 * vérifier que le domaine sert bien la version attendue (cf. docs/ci-cd.md).
 */
export async function GET() {
  const commit = process.env.VERCEL_GIT_COMMIT_SHA ?? null;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", commit }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "erreur", commit }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
