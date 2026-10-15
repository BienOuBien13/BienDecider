import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionCompany } from "@/lib/session";
import { LEAD_STAGES, type LeadStage } from "@/lib/funnel-shared";
import { dayToDate } from "@/lib/lead-followup";

/** Étapes que le dirigeant déclare lui-même — "propose" passe par la validation de la proposition. */
const DECLARABLE: LeadStage[] = ["a_contacter", "contacte", "repondu", "rdv", "gagne", "perdu", "ecarte"];
const DAY = 24 * 60 * 60 * 1000;

const bodySchema = z.object({
  stage: z.string().optional(),
  contactedAt: z.iso.date().optional(),
  deferUntil: z.iso.date().nullable().optional(),
  reason: z.string().trim().min(1).max(300).optional(),
}).refine((body) => body.stage !== undefined || body.contactedAt !== undefined || body.deferUntil !== undefined, { message: "Aucune modification demandée" });

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const company = await getSessionCompany();
  if (!company) {
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.lead.findUnique({ where: { id } });
  if (!existing || existing.companyId !== company.id) {
    return NextResponse.json({ error: "Prospect introuvable" }, { status: 404 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return bad("Demande invalide : étape, date (AAAA-MM-JJ) ou raison incorrecte.");
  const { stage, contactedAt, deferUntil, reason } = parsed.data;
  if (stage !== undefined && (!LEAD_STAGES.includes(stage as LeadStage) || !DECLARABLE.includes(stage as LeadStage))) {
    return bad(`stage doit être l'un de : ${DECLARABLE.join(", ")}`);
  }
  if (existing.stage === "propose") return bad("Ce prospect attend votre décision dans les productions à valider.", 409);

  const now = new Date();
  const contactDate = contactedAt ? dayToDate(contactedAt) : null;
  if (contactDate && contactDate.getTime() > now.getTime() + DAY / 2) return bad("La date de contact ne peut pas être dans le futur.");
  if (deferUntil) {
    const until = dayToDate(deferUntil).getTime();
    if (until <= now.getTime() || until > now.getTime() + 366 * DAY) return bad("La date de reprise doit être dans le futur, dans l'année.");
  }

  const data: Record<string, Date | string | null> = {};
  const target = (stage ?? existing.stage) as LeadStage;

  if (stage === "ecarte") {
    if (existing.stage !== "a_contacter") return bad("Seul un prospect à contacter peut être écarté.", 409);
    if (!reason) return bad("Indiquez la raison pour écarter ce prospect.");
    Object.assign(data, { stage, statusReason: reason, deferredUntil: null });
  } else if (stage === "a_contacter") {
    if (existing.stage === "ecarte") {
      if (!existing.statusReason) return bad("Ce prospect a été écarté avec sa proposition : rouvrez la proposition pour le reprendre.", 409);
      Object.assign(data, { stage, statusReason: null, deferredUntil: null });
    } else if (existing.stage === "contacte") {
      Object.assign(data, { stage, contactedAt: null, deferredUntil: null });
    } else if (existing.stage !== "a_contacter") {
      return bad("Ce prospect est déjà plus avancé : déclarez l'étape réelle.", 409);
    }
  } else if (stage !== undefined) {
    if (existing.stage === "ecarte") return bad("Reprenez d'abord ce prospect avant de déclarer une étape.", 409);
    if (existing.stage === "a_contacter" && stage !== "contacte") return bad("Déclarez d'abord le contact réellement effectué.", 409);
    Object.assign(data, {
      stage,
      contactedAt: stage === "contacte" ? contactDate ?? existing.contactedAt ?? now : undefined,
      repliedAt: stage === "repondu" && !existing.repliedAt ? now : undefined,
      meetingAt: stage === "rdv" && !existing.meetingAt ? now : undefined,
      closedAt: ["gagne", "perdu"].includes(stage) ? now : undefined,
      ...(stage === "contacte" ? { deferredUntil: null, statusReason: null } : {}),
    });
  }

  if (contactDate && stage === undefined) {
    if (!["contacte", "repondu", "rdv", "gagne", "perdu"].includes(target) || !existing.contactedAt) return bad("Ce prospect n'a pas de contact déclaré à modifier.", 409);
    data.contactedAt = contactDate;
  }

  if (deferUntil !== undefined) {
    if (target !== "a_contacter") return bad("Seul un prospect à contacter peut être différé.", 409);
    if (deferUntil && !reason) return bad("Indiquez la raison pour différer ce prospect.");
    Object.assign(data, deferUntil
      ? { deferredUntil: dayToDate(deferUntil), statusReason: reason ?? null }
      : { deferredUntil: null, statusReason: null });
  }

  const lead = await prisma.lead.update({ where: { id }, data });
  return NextResponse.json(lead);
}
