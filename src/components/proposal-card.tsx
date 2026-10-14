"use client";

import type { AgentProposal } from "@prisma/client";
import { useState } from "react";
import { PERSONAS, type AgentKey } from "@/lib/agents/personas";
import { assessActionRisk } from "@/lib/delegation-risk";

export const STATUS_LABELS: Record<string, string> = {
  en_attente: "À valider",
  validee: "Validée",
  modifiee: "Modifiée",
  rejetee: "Rejetée",
  executee: "Réalisée",
  envoi_en_cours: "Envoi en cours",
  envoi_incertain: "Envoi à vérifier dans Gmail",
};

const KIND_LABELS: Record<string, string> = {
  gbp_update: "Fiche Google",
  review_reply: "Réponse à un avis",
  site_web_content: "Contenu du site web",
  social_post: "Post réseaux sociaux",
  prospecting_email: "Email de prospection",
  piste_croissance: "Piste de croissance",
  prospect: "Prospect à contacter",
  gmail_email: "Email Gmail manuel",
};

export type ProposalDecision = {
  status: "brouillon" | "validee" | "modifiee" | "rejetee";
  expectedVersion: number;
  content?: string;
  rejectionReason?: string;
};

const RISK_FACTOR_LABELS: Record<keyof ReturnType<typeof assessActionRisk>["factors"], string> = {
  publicExposure: "Exposition publique",
  externalCommunication: "Communication externe",
  thirdPartyData: "Données d'un tiers",
  spending: "Dépense engagée",
  irreversible: "Action difficile à annuler",
};

export function ProposalCard({
  proposal,
  onDecision,
  onExecute,
  busy,
  showAgent = false,
  riskSettings,
}: {
  proposal: AgentProposal;
  onDecision: (id: string, decision: ProposalDecision) => Promise<boolean>;
  onExecute?: (id: string, expectedVersion: number) => void;
  busy?: boolean;
  showAgent?: boolean;
  riskSettings?: Record<string, string>;
}) {
  const [editing, setEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(proposal.content);
  const [rejecting, setRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const persona = PERSONAS[proposal.agent as Exclude<AgentKey, "co_ceo">];
  const risk = assessActionRisk(proposal.kind, {}, riskSettings?.[proposal.kind]);
  let displayContent = proposal.content;
  if (proposal.kind === "gmail_email") {
    try {
      const message: unknown = JSON.parse(proposal.content);
      if (message && typeof message === "object" && "to" in message && "text" in message && typeof message.to === "string" && typeof message.text === "string") {
        displayContent = `Destinataire : ${message.to}\n\n${message.text}`;
      }
    } catch {
      displayContent = proposal.content;
    }
  }
  const approved = ["validee", "modifiee"].includes(proposal.status);
  // Une approbation antérieure au versionnage ne désigne aucune version : elle doit être reconfirmée avant exécution.
  const approvalNeedsConfirmation = approved && proposal.approvedVersion !== proposal.version;
  const canEdit = proposal.status === "en_attente" || (approved && proposal.kind !== "prospect");
  const canPublishSite =
    proposal.kind === "site_web_content" &&
    approved &&
    !approvalNeedsConfirmation &&
    onExecute;
  const decide = (decision: Omit<ProposalDecision, "expectedVersion">) =>
    onDecision(proposal.id, { ...decision, expectedVersion: proposal.version });

  // En cas d'échec, l'éditeur reste ouvert avec le texte saisi : rien n'est perdu ni annoncé à tort comme enregistré.
  async function saveDraft() {
    if (await decide({ status: "brouillon", content: editedContent.trim() })) setEditing(false);
  }

  async function approveEditedContent(event: React.FormEvent) {
    event.preventDefault();
    if (await decide({ status: "modifiee", content: editedContent.trim() })) setEditing(false);
  }

  async function rejectProposal(event: React.FormEvent) {
    event.preventDefault();
    if (await decide({ status: "rejetee", rejectionReason: rejectionReason.trim() })) {
      setRejecting(false);
      setRejectionReason("");
    }
  }

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-slate-500">
          {showAgent && persona ? `${persona.name} · ` : ""}
          {KIND_LABELS[proposal.kind] ?? proposal.kind}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 ${
            ["en_attente", "envoi_en_cours", "envoi_incertain"].includes(proposal.status)
              ? "bg-amber-100 text-amber-800"
              : proposal.status === "rejetee"
                ? "bg-slate-100 text-slate-500"
                : "bg-emerald-100 text-emerald-800"
          }`}
        >
          {STATUS_LABELS[proposal.status] ?? proposal.status}
        </span>
      </div>
      <h3 className="mt-1 font-medium">{proposal.title}</h3>
      <p className="mt-1 text-xs text-slate-600">
        Version {proposal.version}
        {proposal.status === "en_attente" && proposal.draftSavedAt && (
          <> · Brouillon enregistré le {new Date(proposal.draftSavedAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}, non approuvé</>
        )}
        {approved && proposal.approvedVersion === proposal.version && " · version approuvée"}
      </p>
      <details className="mt-2">
        <summary className="flex w-fit cursor-pointer items-center gap-2 text-xs text-slate-600">
          <span className={`rounded px-2 py-0.5 font-medium ${risk.level === "faible" ? "bg-emerald-50 text-emerald-800" : risk.level === "modere" ? "bg-amber-50 text-amber-800" : "bg-rose-50 text-rose-800"}`}>{risk.label}</span>
          <span>Pourquoi ?</span>
        </summary>
        <p className="mt-1 max-w-prose text-xs text-slate-600">{risk.explanation}</p>
        <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
          {(Object.entries(risk.factors) as [keyof typeof risk.factors, boolean][])
            .filter(([, applies]) => applies)
            .map(([factor]) => <li key={factor}>{RISK_FACTOR_LABELS[factor]}</li>)}
          {!Object.values(risk.factors).some(Boolean) && <li>Aucun facteur aggravant identifié</li>}
        </ul>
        <p className="mt-1 text-xs font-medium text-slate-700">Dans ce prototype, toute action réelle reste soumise à votre validation.</p>
      </details>
      {editing ? (
        <form onSubmit={approveEditedContent} className="mt-3 space-y-2">
          <label htmlFor={`proposal-content-${proposal.id}`} className="text-xs font-medium text-slate-700">Modifier le contenu</label>
          <textarea
            id={`proposal-content-${proposal.id}`}
            aria-label="Modifier le contenu"
            value={editedContent}
            onChange={(event) => setEditedContent(event.target.value)}
            rows={6}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          {approved && (
            <p className="text-xs text-amber-800">Enregistrer une modification retire l&apos;approbation actuelle : la nouvelle version sera à relire.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={saveDraft} disabled={busy || !editedContent.trim()} className="min-h-11 rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-800 disabled:opacity-50">
              Enregistrer le brouillon
            </button>
            <button type="submit" disabled={busy || !editedContent.trim()} className="min-h-11 rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white disabled:opacity-50">
              Approuver cette version
            </button>
            <button type="button" onClick={() => { setEditedContent(proposal.content); setEditing(false); }} disabled={busy} className="min-h-11 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700 disabled:opacity-50">
              Annuler la modification
            </button>
          </div>
        </form>
      ) : (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs text-indigo-600">Voir le contenu</summary>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{displayContent}</p>
        </details>
      )}
      {proposal.status === "rejetee" && proposal.rejectionReason && (
        <p className="mt-3 whitespace-pre-wrap break-words text-sm text-slate-600"><span className="font-medium">Raison du rejet : </span>{proposal.rejectionReason}</p>
      )}
      {proposal.status === "en_attente" && rejecting && (
        <form onSubmit={rejectProposal} className="mt-3 space-y-2">
          <label htmlFor={`rejection-reason-${proposal.id}`} className="text-xs font-medium text-slate-700">Raison du rejet (facultative)</label>
          <textarea id={`rejection-reason-${proposal.id}`} value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} maxLength={1000} rows={3} disabled={busy} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy} className="min-h-11 rounded-lg bg-slate-700 px-3 py-2 text-sm text-white disabled:opacity-50">Confirmer le rejet</button>
            <button type="button" onClick={() => { setRejecting(false); setRejectionReason(""); }} disabled={busy} className="min-h-11 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700 disabled:opacity-50">Annuler le rejet</button>
          </div>
        </form>
      )}
      {canEdit && !rejecting && (
        <div className="mt-3 flex flex-wrap gap-2">
          {!editing && (
            <button
              type="button"
              onClick={() => { setEditedContent(proposal.content); setEditing(true); }}
              disabled={busy}
              className="min-h-11 rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-800 disabled:opacity-50"
            >
              Modifier
            </button>
          )}
          {!editing && approvalNeedsConfirmation && (
            <button
              onClick={() => decide({ status: "validee" })}
              disabled={busy}
              className="min-h-11 rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              Confirmer l&apos;approbation de cette version
            </button>
          )}
          {!editing && proposal.status === "en_attente" && (
            <>
              <button
                onClick={() => decide({ status: "validee" })}
                disabled={busy}
                className="min-h-11 rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white disabled:opacity-50"
              >
                Valider
              </button>
              <button
                onClick={() => setRejecting(true)}
                disabled={busy}
                className="min-h-11 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700 disabled:opacity-50"
              >
                Rejeter
              </button>
            </>
          )}
        </div>
      )}
      {canPublishSite && (
        <button
          onClick={() => onExecute(proposal.id, proposal.version)}
          disabled={busy}
          className="mt-3 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {busy ? "Publication…" : "Publier le site"}
        </button>
      )}
    </article>
  );
}
