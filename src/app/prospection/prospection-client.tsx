"use client";

import { useState } from "react";
import Link from "next/link";
import type { Lead } from "@prisma/client";
import { PERSONAS } from "@/lib/agents/personas";
import { countLeads, MIN_CONTACTS_TO_CONCLUDE, type LeadStage } from "@/lib/funnel-shared";

const STAGE_LABELS: Record<string, string> = {
  a_contacter: "À contacter",
  contacte: "Contacté",
  repondu: "A répondu",
  rdv: "RDV pris",
  gagne: "Client",
  perdu: "Perdu",
};

/** Étapes suivantes déclarables depuis chaque étape — le dirigeant dit ce qui s'est passé, Pepito ne devine rien. */
const NEXT: Record<string, LeadStage[]> = {
  a_contacter: ["contacte", "perdu"],
  contacte: ["repondu", "perdu"],
  repondu: ["rdv", "gagne", "perdu"],
  rdv: ["gagne", "perdu"],
  gagne: [],
  perdu: ["contacte"],
};

const ACTION_LABELS: Record<string, string> = {
  contacte: "J'ai pris contact",
  repondu: "Il a répondu",
  rdv: "RDV pris",
  gagne: "Devenu client",
  perdu: "Sans suite",
};

const ORDER: LeadStage[] = ["a_contacter", "contacte", "repondu", "rdv", "gagne", "perdu"];

function pct(part: number, whole: number) {
  return whole > 0 ? `${Math.round((part / whole) * 100)} %` : "—";
}

export function ProspectionClient({
  initialLeads,
  initialAutoOutreach,
  sendingConfigured,
}: {
  initialLeads: Lead[];
  initialAutoOutreach: boolean;
  sendingConfigured: boolean;
}) {
  const [leads, setLeads] = useState(initialLeads);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoOutreach, setAutoOutreach] = useState(initialAutoOutreach);
  const [outreachSaving, setOutreachSaving] = useState(false);

  async function toggleAutoOutreach(next: boolean) {
    setOutreachSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/companies/outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Impossible d'enregistrer");
      setAutoOutreach(data.autoOutreachEnabled);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible d'enregistrer");
    } finally {
      setOutreachSaving(false);
    }
  }

  async function declare(id: string, stage: LeadStage) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Impossible d'enregistrer");
      setLeads((prev) => prev.map((l) => (l.id === id ? data : l)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible d'enregistrer");
    } finally {
      setBusyId(null);
    }
  }

  // Recalculé depuis l'état local (pas depuis `funnel`, figé au chargement
  // serveur) pour refléter une déclaration sans attendre un rechargement.
  const t = countLeads(leads);
  const steps = [
    { label: "Identifiés", value: t.identifies },
    { label: "Contactés", value: t.contactes, rate: pct(t.contactes, t.identifies) },
    { label: "Réponses", value: t.reponses, rate: pct(t.reponses, t.contactes) },
    { label: "RDV", value: t.rdv, rate: pct(t.rdv, t.reponses) },
    { label: "Clients", value: t.clients, rate: pct(t.clients, t.rdv) },
  ];

  const segments = new Map<string, Lead[]>();
  for (const lead of leads) {
    const key = lead.segment?.trim() || "sans segment";
    segments.set(key, [...(segments.get(key) ?? []), lead]);
  }
  const bySegment = [...segments.entries()]
    .map(([segment, list]) => ({ segment, counts: countLeads(list) }))
    .filter((s) => s.counts.contactes > 0)
    .sort((a, b) => b.counts.contactes - a.counts.contactes);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold">Prospection</h1>
      <p className="mt-1 text-sm text-slate-500">
        {PERSONAS.demarchage.name} identifie des organisations correspondant à votre cible ; vous décidez lesquelles contacter
        et déclarez ce qui s&apos;est passé. Chiffres calculés en base, jamais estimés par un agent.
      </p>

      <section className="mt-4 rounded-lg border bg-white p-3">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={autoOutreach}
            disabled={outreachSaving || !sendingConfigured}
            onChange={(e) => toggleAutoOutreach(e.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span className="text-sm">
            <span className="font-medium text-slate-800">Laisser {PERSONAS.demarchage.name} prendre contact lui-même</span>{" "}
            avec les prospects que vous validez, sans que vous ayez à envoyer l&apos;email vous-même. Désactivé par défaut :
            c&apos;est vous qui décidez, prospect par prospect, de l&apos;activer ou non.
            {!sendingConfigured && (
              <span className="mt-1 block text-xs text-amber-600">
                Pas encore activable : aucun fournisseur d&apos;envoi d&apos;email n&apos;est configuré côté serveur. Le réglage
                sera mémorisé et appliqué dès qu&apos;un canal d&apos;envoi sera en place.
              </span>
            )}
          </span>
        </label>
      </section>

      <section className="mt-6 grid grid-cols-5 gap-2">
        {steps.map((s) => (
          <div key={s.label} className="rounded-lg border bg-white p-3 text-center">
            <p className="text-2xl font-semibold">{s.value}</p>
            <p className="text-xs text-slate-500">{s.label}</p>
            {s.rate && <p className="text-[11px] text-slate-400">{s.rate}</p>}
          </div>
        ))}
      </section>
      <p className="mt-1 text-[11px] text-slate-400">
        Taux affichés par rapport à l&apos;étape précédente. Les prospects marqués « sans suite » restent comptés comme contactés.
      </p>

      {bySegment.length > 0 && (
        <section className="mt-6 rounded-lg border bg-white p-4">
          <h2 className="text-sm font-medium">Par type de cible</h2>
          <ul className="mt-2 divide-y text-sm">
            {bySegment
              .map((s) => (
                <li key={s.segment} className="flex flex-wrap items-center gap-x-3 py-2">
                  <span className="font-medium capitalize">{s.segment}</span>
                  <span className="text-slate-500">
                    {s.counts.contactes} contactés · {s.counts.reponses} réponses · {s.counts.rdv} RDV · {s.counts.clients} clients
                  </span>
                  {s.counts.contactes < MIN_CONTACTS_TO_CONCLUDE && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                      trop tôt pour conclure (moins de {MIN_CONTACTS_TO_CONCLUDE} contacts)
                    </span>
                  )}
                </li>
              ))}
          </ul>
        </section>
      )}

      {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {leads.length === 0 ? (
        <div role="region" className="mt-8 border-t border-slate-200 py-5" aria-label="Prospection à préparer">
          <h2 className="text-base font-medium">Choisir les organisations à contacter</h2>
          <p className="mt-2 max-w-prose text-sm text-slate-600">Aucun prospect validé pour l&apos;instant. {PERSONAS.demarchage.name} prépare des propositions ; vous choisissez les organisations à contacter. Les contacts retenus apparaîtront ici pour suivre les échanges et les rendez-vous.</p>
          <div className="mt-3 flex flex-wrap gap-4">
            <Link href="/dashboard?view=validation" className="text-sm font-medium text-indigo-600 underline">Examiner les prospects proposés</Link>
            <Link href="/equipe" className="text-sm text-indigo-600 underline">Confier une recherche à {PERSONAS.demarchage.name}</Link>
          </div>
        </div>
      ) : (
        ORDER.filter((stage) => leads.some((l) => l.stage === stage)).map((stage) => (
          <section key={stage} className="mt-6">
            <h2 className="text-sm font-medium text-slate-700">
              {STAGE_LABELS[stage]} <span className="text-slate-400">({leads.filter((l) => l.stage === stage).length})</span>
            </h2>
            <ul className="mt-2 space-y-2">
              {leads
                .filter((l) => l.stage === stage)
                .map((lead) => (
                  <li key={lead.id} className="rounded-lg border bg-white p-3 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{lead.name}</p>
                        <p className="mt-0.5 text-slate-600">{lead.reason}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {lead.segment && <span className="capitalize">{lead.segment} · </span>}
                          {lead.publicContact && <span>{lead.publicContact} · </span>}
                          {lead.source && (
                            <a href={lead.source} target="_blank" rel="noreferrer" className="underline">
                              source
                            </a>
                          )}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {NEXT[lead.stage]?.map((next) => (
                          <button
                            key={next}
                            disabled={busyId === lead.id}
                            onClick={() => declare(lead.id, next)}
                            className={`rounded-lg border px-2 py-1 text-xs disabled:opacity-50 ${
                              next === "gagne"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                : next === "perdu"
                                  ? "border-slate-200 text-slate-500"
                                  : "border-indigo-200 bg-indigo-50 text-indigo-800"
                            }`}
                          >
                            {ACTION_LABELS[next]}
                          </button>
                        ))}
                      </div>
                    </div>
                  </li>
                ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
