import { NextRequest, NextResponse } from "next/server";
import { setSessionEmail } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";

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
  if (typeof password !== "string" || password.length < 6) {
    return NextResponse.json({ error: "Mot de passe requis (6 caractères minimum)" }, { status: 400 });
  }

  const existing = await prisma.company.findUnique({ where: { ownerEmail: email } });
  if (existing) {
    return NextResponse.json({ error: "Un compte existe déjà avec cet email. Connectez-vous." }, { status: 409 });
  }

  let company;
  try {
    company = await prisma.company.create({
      data: {
        ownerEmail: email,
        passwordHash: await hashPassword(password),
        name: "",
        trade: "",
        servingArea: "",
      },
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "Un compte existe déjà avec cet email. Connectez-vous." }, { status: 409 });
    }
    throw error;
  }

  company = await prisma.company.update({
    where: { id: company.id },
    data: { loginCount: { increment: 1 }, lastLoginAt: new Date() },
  });
  await setSessionEmail(email);

  return NextResponse.json({ hasCompany: Boolean(company.name), companyId: company.id }, { status: 201 });
}