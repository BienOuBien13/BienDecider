import { NextRequest, NextResponse } from "next/server";
import { setSessionEmail } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/password";

const MAX_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

/**
 * Connexion par email + mot de passe. L'inscription est un flux séparé : une
 * faute de frappe ne doit jamais créer une entreprise vide.
 * Un compte antérieur sans passwordHash accepte encore son premier mot de
 * passe, pour préserver la migration en douceur des comptes existants.
 *
 * Anti-force-brute (cf. docs/backlog.md, point P0) : 5 échecs consécutifs
 * verrouillent le compte 15 minutes. Stocké en base (pas en mémoire) pour
 * rester valable entre plusieurs instances serverless.
 */
export async function POST(request: NextRequest) {
  let body: { email?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const { password } = body;

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Email invalide" }, { status: 400 });
  }
  if (!password || typeof password !== "string" || password.length < 6) {
    return NextResponse.json({ error: "Mot de passe requis (6 caractères minimum)" }, { status: 400 });
  }

  let company = await prisma.company.findUnique({ where: { ownerEmail: email } });

  if (company?.lockedUntil && company.lockedUntil > new Date()) {
    const minutes = Math.ceil((company.lockedUntil.getTime() - Date.now()) / 60000);
    return NextResponse.json(
      { error: `Trop de tentatives échouées. Réessayez dans ${minutes} minute(s).` },
      { status: 429 },
    );
  }

  if (!company) {
    return NextResponse.json(
      { error: "Aucun compte associé à cet email. Créez un compte pour continuer." },
      { status: 404 },
    );
  }

  if (!company.passwordHash) {
    company = await prisma.company.update({
      where: { id: company.id },
      data: { passwordHash: await hashPassword(password), sessionVersion: { increment: 1 } },
    });
  } else if (!(await verifyPassword(password, company.passwordHash))) {
    const attempts = company.failedLoginAttempts + 1;
    await prisma.company.update({
      where: { id: company.id },
      data: {
        failedLoginAttempts: attempts,
        lockedUntil: attempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCK_DURATION_MS) : undefined,
      },
    });
    const remaining = MAX_ATTEMPTS - attempts;
    return NextResponse.json(
      {
        error:
          remaining > 0
            ? `Mot de passe incorrect (${remaining} tentative(s) restante(s))`
            : "Trop de tentatives échouées. Compte verrouillé 15 minutes.",
      },
      { status: remaining > 0 ? 401 : 429 },
    );
  }

  await setSessionEmail(email);
  company = await prisma.company.update({
    where: { id: company.id },
    data: { loginCount: { increment: 1 }, lastLoginAt: new Date(), failedLoginAttempts: 0, lockedUntil: null },
  });

  return NextResponse.json({
    hasCompany: Boolean(company.name),
    companyId: company.id,
  });
}
