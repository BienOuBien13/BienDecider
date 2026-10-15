"use client";

import { useRef, useState } from "react";
import type { Lead } from "@prisma/client";
import { AskPaulButton } from "@/components/ask-paul-button";
import { buildOutreachDraft, formatDay, hasPlaceholders, isDeferred, leadReadiness } from "@/lib/lead-followup";
import type { LeadStage } from "@/lib/funnel-shared";

export type LeadPatch = { stage?: LeadStage; contactedAt?: string; deferUntil?: string | null; reason?: string };

/** Étapes déclarables après un premier contact — le dirigeant dit ce qui s'est passé, BienDecider ne devine rien. */
const NEXT: Record<string, LeadStage[]> = {
  contacte: ["repondu", "perdu"],
  repondu: ["rdv", "gagne", "perdu"],
  rdv: ["gagne", "perdu"],
  perdu: ["contacte"],
};

const ACTION_LABELS: Record<string, string> = {
  contacte: "J'ai pris contact",
  repondu: "Il a répondu",
  rdv: "RDV pris",
  gagne: "Devenu client",
  perdu: "Sans suite",
};

type Mode = "draft" | "contact" | "date" | "defer" | "discard" | null;

function localDay(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toLocaleDateString("sv-SE");
}

const secondary = "min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 disabled:opacity-50";
const primary = "min-h-11 rounded-lg bg-indigo-700 px-3 py-2 text-sm text-white disabled:opacity-50";

export function LeadCard({ lead, now, busy, companyName, trade, phone, onPatch }: {
  lead: Lead;
  now: number;
  busy: boolean;
  companyName: string;
  trade: string | null;
  phone: string | null;
  onPatch: (id: string, patch: LeadPatch) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<Mode>(null);
  const [draft, setDraft] = useState("");
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [day, setDay] = useState("");
  const [reason, setReason] = useState("");
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const readiness = leadReadiness(lead);
  const deferred = isDeferred(lead, now);
  const contacted = lead.stage !== "a_contacter" && lead.stage !== "ecarte" && lead.contactedAt;

  function open(next: Exclude<Mode, null>) {
    setReason("");
    setCopyNotice(null);
    if (next === "contact") setDay(localDay());
    if (next === "date") setDay(lead.contactedAt ? new Date(lead.contactedAt).toISOString().slice(0, 10) : localDay());
    if (next === "defer") setDay(localDay(7));
    if (next === "draft" && !draft) setDraft(buildOutreachDraft({ lead, companyName, trade, phone }));
    setMode(mode === next ? null : next);
  }

  async function submit(patch: LeadPatch) {
    if (await onPatch(lead.id, patch)) setMode(null);
  }

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(draft);
      setCopyNotice("Message copié. Rien n'a été envoyé et ce prospect n'est pas marqué comme contacté.");
    } catch {
      draftRef.current?.select();
      setCopyNotice("Copie automatique impossible : le texte est sélectionné, copiez-le avec Ctrl+C. Rien n'a été envoyé.");
    }
  }

  return (
    <div className="text-sm">
      <p className="font-medium">{lead.name}</p>
      <p className="mt-0.5 text-slate-600">{lead.reason}</p>
      <p className="mt-1 text-xs text-slate-600">
        {lead.segment && <span className="capitalize">{lead.segment} · </span>}
        {lead.publicContact && <span>{lead.publicContact} · </span>}
        {lead.source && <a href={lead.source} target="_blank" rel="noreferrer" className="underline">source</a>}
      </p>
      {lead.stage === "a_contacter" && readiness.toConfirm.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-amber-900">
          {readiness.toConfirm.map((item) => <li key={item}>{item}</li>)}
        </ul>
      )}
      {deferred && <p className="mt-2 text-xs text-slate-700">Différé jusqu&apos;au {formatDay(lead.deferredUntil)}{lead.statusReason ? ` : ${lead.statusReason}` : ""}.</p>}
      {lead.stage === "ecarte" && lead.statusReason && <p className="mt-2 text-xs text-slate-700">Écarté : {lead.statusReason}</p>}
      {contacted && <p className="mt-2 text-xs text-slate-700">Contact déclaré le {formatDay(lead.contactedAt)}.</p>}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <AskPaulButton element={{ type: "lead", id: lead.id, title: lead.name }} />
        {lead.stage === "a_contacter" && (
          <>
            <button type="button" onClick={() => open("draft")} aria-expanded={mode === "draft"} className={secondary}>Préparer un message</button>
            <button type="button" onClick={() => open("contact")} aria-expanded={mode === "contact"} className={secondary}>J&apos;ai pris contact</button>
            <button type="button" onClick={() => open("defer")} aria-expanded={mode === "defer"} className={secondary}>Différer</button>
            <button type="button" onClick={() => open("discard")} aria-expanded={mode === "discard"} className={secondary}>Écarter</button>
          </>
        )}
        {lead.stage === "ecarte" && <button type="button" disabled={busy} onClick={() => void submit({ stage: "a_contacter" })} className={secondary}>Reprendre ce prospect</button>}
        {NEXT[lead.stage]?.map((next) => (
          <button key={next} type="button" disabled={busy} onClick={() => void submit({ stage: next })} className={secondary}>{ACTION_LABELS[next]}</button>
        ))}
        {contacted && <button type="button" onClick={() => open("date")} aria-expanded={mode === "date"} className={secondary}>Modifier la date du contact</button>}
        {lead.stage === "contacte" && <button type="button" disabled={busy} onClick={() => void submit({ stage: "a_contacter" })} className={secondary}>Ce n&apos;était pas un contact</button>}
        {lead.stage === "a_contacter" && deferred && <button type="button" disabled={busy} onClick={() => void submit({ deferUntil: null })} className={secondary}>Reprendre maintenant</button>}
      </div>

      {mode === "draft" && (
        <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3">
          <label htmlFor={`draft-${lead.id}`} className="text-xs font-medium text-slate-700">Message préparé à partir de ce prospect (modifiable)</label>
          <textarea id={`draft-${lead.id}`} ref={draftRef} value={draft} onChange={(event) => { setDraft(event.target.value); setCopyNotice(null); }} rows={10} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          {hasPlaceholders(draft) && <p className="text-xs text-amber-900">Complétez les passages entre crochets avant d&apos;envoyer.</p>}
          {!lead.publicContact?.trim() && <p className="text-xs text-amber-900">Aucune adresse n&apos;est proposée : BienDecider n&apos;en invente pas. Trouvez le contact sur la source avant d&apos;écrire.</p>}
          <p className="text-xs text-slate-700">BienDecider n&apos;envoie pas ce message. Copiez-le, envoyez-le vous-même, puis déclarez le contact.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void copyDraft()} className={primary}>Copier le message</button>
            <button type="button" onClick={() => setMode(null)} className={secondary}>Fermer</button>
          </div>
          {copyNotice && <p role="status" className="text-sm text-emerald-800">{copyNotice}</p>}
        </div>
      )}

      {(mode === "contact" || mode === "date") && (
        <form onSubmit={(event) => { event.preventDefault(); void submit(mode === "contact" ? { stage: "contacte", contactedAt: day } : { contactedAt: day }); }} className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3">
          <p className="text-xs text-slate-700">{mode === "contact" ? "Enregistrez seulement un contact réellement effectué. Vous pourrez en corriger la date ou l'annuler." : "Corrigez la date du contact déclaré."}</p>
          <label htmlFor={`day-${lead.id}`} className="block text-xs font-medium text-slate-700">Date du contact</label>
          <input id={`day-${lead.id}`} type="date" value={day} max={localDay()} required onChange={(event) => setDay(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy || !day} className={primary}>{mode === "contact" ? "Enregistrer le contact" : "Enregistrer la date"}</button>
            <button type="button" onClick={() => setMode(null)} className={secondary}>Annuler</button>
          </div>
        </form>
      )}

      {(mode === "defer" || mode === "discard") && (
        <form onSubmit={(event) => { event.preventDefault(); void submit(mode === "defer" ? { deferUntil: day, reason } : { stage: "ecarte", reason }); }} className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3">
          {mode === "defer" && (
            <>
              <label htmlFor={`until-${lead.id}`} className="block text-xs font-medium text-slate-700">Reprendre ce prospect le</label>
              <input id={`until-${lead.id}`} type="date" value={day} min={localDay(1)} required onChange={(event) => setDay(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </>
          )}
          <label htmlFor={`reason-${lead.id}`} className="block text-xs font-medium text-slate-700">{mode === "defer" ? "Raison du report (obligatoire)" : "Raison de l'écart (obligatoire)"}</label>
          <textarea id={`reason-${lead.id}`} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} rows={2} required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy || !reason.trim() || (mode === "defer" && !day)} className={primary}>{mode === "defer" ? "Différer ce prospect" : "Écarter ce prospect"}</button>
            <button type="button" onClick={() => setMode(null)} className={secondary}>Annuler</button>
          </div>
        </form>
      )}
    </div>
  );
}
