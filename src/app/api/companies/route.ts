import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionEmail } from "@/lib/session";
import { omitPasswordHash } from "@/lib/safe-company";

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
  const parsedTargetDate = targetDate ? new Date(targetDate) : null;
  if (parsedTargetDate && Number.isNaN(parsedTargetDate.getTime())) {
    return NextResponse.json({ error: "targetDate invalide" }, { status: 400 });
  }
  const toInt = (v: unknown) => (v == null || v === "" ? null : Number(v));
  const clearableText = (value: unknown) =>
    typeof value === "string" ? value.trim() || null : value;

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
