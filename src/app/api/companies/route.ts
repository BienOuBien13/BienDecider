import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionEmail } from "@/lib/session";
import { omitPasswordHash } from "@/lib/safe-company";
import { z } from "zod";

const profileDetailsSchema = z.object({
  objective: z.string().trim().max(500).optional(),
  website: z.string().trim().max(500).optional(),
  socialHandles: z.string().trim().max(500).optional(),
  description: z.string().trim().max(2000).optional(),
  phone: z.string().trim().max(100).optional(),
  certifications: z.string().trim().max(500).optional(),
  openingHours: z.string().trim().max(500).optional(),
}).strict();

export async function PATCH(request: NextRequest) {
  const ownerEmail = await getSessionEmail();
  if (!ownerEmail) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const company = await prisma.company.findUnique({ where: { ownerEmail } });
  if (!company) return NextResponse.json({ error: "Entreprise introuvable" }, { status: 404 });
  const parsed = profileDetailsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Compléments de profil invalides" }, { status: 400 });
  const data = Object.fromEntries(Object.entries(parsed.data).map(([key, value]) => [key, value || null]));
  const updated = await prisma.company.update({ where: { id: company.id }, data });
  return NextResponse.json(omitPasswordHash(updated));
}

export async function GET() {
  const ownerEmail = await getSessionEmail();
  if (!ownerEmail) {
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  }
  const company = await prisma.company.findUnique({ where: { ownerEmail } });
  return NextResponse.json(company ? omitPasswordHash(company) : null);
}

export async function POST(request: NextRequest) {
  const ownerEmail = await getSessionEmail();
  if (!ownerEmail) {
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  }

  const body = await request.json();
  const {
    name,
    trade,
    servingArea,
    website,
    socialHandles,
    objective,
    description,
    phone,
    certifications,
    openingHours,
    monthlyRevenue,
    revenueTarget,
    targetDate,
    averageClientValue,
    newClientsPerMonth,
  } = body;

  if (!name || !trade || !servingArea) {
    return NextResponse.json(
      { error: "name, trade et servingArea sont requis" },
      { status: 400 },
    );
  }

  const amounts = { monthlyRevenue, revenueTarget, averageClientValue, newClientsPerMonth };
  for (const [key, value] of Object.entries(amounts)) {
    if (value != null && value !== "" && (!Number.isInteger(Number(value)) || Number(value) < 0)) {
      return NextResponse.json({ error: `${key} doit être un entier positif` }, { status: 400 });
    }
  }
  const optionalTextFields = { website, socialHandles, objective, description, phone, certifications, openingHours };
  for (const [key, value] of Object.entries(optionalTextFields)) {
    if (value != null && typeof value !== "string") {
      return NextResponse.json({ error: `${key} doit être du texte` }, { status: 400 });
    }
  }
  const parsedTargetDate = targetDate ? new Date(targetDate) : null;
  if (parsedTargetDate && Number.isNaN(parsedTargetDate.getTime())) {
    return NextResponse.json({ error: "targetDate invalide" }, { status: 400 });
  }
  const toInt = (v: unknown) => (v == null || v === "" ? null : Number(v));
  const clearableText = (value: unknown): string | null | undefined => {
    if (value === undefined || value === null) return value;
    return typeof value === "string" ? value.trim() || null : null;
  };

  const data = {
    name,
    trade,
    servingArea,
    website: clearableText(website),
    socialHandles: clearableText(socialHandles),
    objective: clearableText(objective),
    description: clearableText(description),
    phone: clearableText(phone),
    certifications: clearableText(certifications),
    openingHours: clearableText(openingHours),
    monthlyRevenue: toInt(monthlyRevenue),
    revenueTarget: toInt(revenueTarget),
    targetDate: parsedTargetDate,
    averageClientValue: toInt(averageClientValue),
    newClientsPerMonth: toInt(newClientsPerMonth),
  };

  const company = await prisma.company.upsert({
    where: { ownerEmail },
    create: { ownerEmail, ...data },
    update: data,
  });
  return NextResponse.json(omitPasswordHash(company), { status: 201 });
}
