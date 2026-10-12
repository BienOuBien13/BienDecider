"use client";

import Link from "next/link";
import { useState } from "react";
import type { AgentProposal, ChatMessage, ActionPlanItem } from "@prisma/client";
import type { SafeCompany } from "@/lib/safe-company";
import { PERSONAS, type AgentKey } from "@/lib/agents/personas";
import { PersonaAvatar } from "@/components/persona-avatar";
import { ProposalCard } from "@/components/proposal-card";
import { JourneyProgress } from "@/components/journey-progress";

type PlanItemWithProposals = ActionPlanItem & { proposals: AgentProposal[] };
type View = "plan" | "validation" | "historique";

function needsAttention(proposal: AgentProposal) {
  return proposal.status === "en_attente" ||
    (proposal.kind === "site_web_content" && ["validee", "modifiee"].includes(proposal.status));
}

export function DashboardClient({ company, initialPlanItems, initialChatMessages, initialProposals, initialDiagnosticCount, initialView, riskSettings }: {
  company: SafeCompany;
  initialPlanItems: PlanItemWithProposals[];
  initialChatMessages: ChatMessage[];
  initialProposals: AgentProposal[];
  initialDiagnosticCount: number;
  initialView: View;
  riskSettings: Record<string, string>;
}) {
  const [planItems, setPlanItems] = useState(initialPlanItems);
  const [proposals, setProposals] = useState(initialProposals);
  const [chatMessages, setChatMessages] = useState(initialChatMessages);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [planLoading, setPlanLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [direction, setDirection] = useState(company.direction ?? "");
  const [directionSaving, setDirectionSaving] = useState(false);
  const [discardingId, setDiscardingId] = useState<string | null>(null);
  const [discardReason, setDiscardReason] = useState("");
  const [decidedIds, setDecidedIds] = useState<string[]>([]);

  async function refresh() {
    const [planResponse, proposalResponse] = await Promise.all([
      fetch(`/api/co-ceo/plan?companyId=${company.id}`), fetch("/api/proposals"),
    ]);
    if (!planResponse.ok || !proposalResponse.ok) throw new Error("Impossible d'actualiser les actions. Rechargez la page.");
    const nextPlan = await planResponse.json();
    const nextProposals: AgentProposal[] = await proposalResponse.json();
    setPlanItems(nextPlan);
    setProposals(nextProposals);
    return nextProposals;
  }

  async function request(url: string, method: string, body?: unknown) {
    const response = await fetch(url, {
      method, headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error ?? "L'opération a échoué. Réessayez.");
    return data;
  }

  function reportError(error: unknown) {
    setError(error instanceof Error ? error.message : "L'opération a échoué.");
  }

  async function handleGeneratePlan() {
    setPlanLoading(true);
    setError(null);
    try {
      await request("/api/co-ceo/plan", "POST", { companyId: company.id });
      await refresh();
      setNotice("Plan mis à jour.");
    } catch (error) { reportError(error); }
    finally { setPlanLoading(false); }
  }

  async function handleLaunch(item: ActionPlanItem) {
    setBusyId(item.id);
    setError(null);
    setNotice(null);
    try {
      await request(`/api/action-plan/${item.id}/launch`, "POST");
      const nextProposals = await refresh();
      const count = nextProposals.filter((proposal) => proposal.planItemId === item.id && needsAttention(proposal)).length;
      setNotice(count > 0 ? `${count} production(s) disponible(s) dans À valider.` : "Action traitée. Le diagnostic est à jour, aucune validation nécessaire.");
    } catch (error) { reportError(error); }
    finally { setBusyId(null); }
  }

  async function handleDiscard(itemId: string) {
    setBusyId(itemId);
    setError(null);
    try {
      await request(`/api/action-plan/${itemId}`, "PATCH", { status: "ecarte", feedback: discardReason });
      setDiscardingId(null);
      setDiscardReason("");
      await refresh();
      setNotice("Action écartée. Elle reste disponible dans l'historique.");
    } catch (error) { reportError(error); }
    finally { setBusyId(null); }
  }

  async function handleDecision(proposalId: string, status: "validee" | "modifiee" | "rejetee", content?: string, rejectionReason?: string): Promise<boolean> {
    setBusyId(proposalId);
    setError(null);
    try {
      await request(`/api/proposals/${proposalId}`, "PATCH", { status, ...(content === undefined ? {} : { content }), ...(rejectionReason === undefined ? {} : { rejectionReason }) });
      setDecidedIds((previous) => [...previous, proposalId]);
      await refresh();
      setNotice(status === "modifiee"
        ? "Version modifiée enregistrée et validée. Aucune action n'a été exécutée automatiquement."
        : status === "validee"
          ? "Production validée. La validation ne vaut pas publication ou envoi."
          : "Production rejetée.");
      return true;
    } catch (error) { reportError(error); return false; }
    finally { setBusyId(null); }
  }

  async function handleExecute(proposalId: string) {
    setBusyId(proposalId);
    setError(null);
    try {
      await request(`/api/proposals/${proposalId}/execute`, "POST");
      setDecidedIds((previous) => [...previous, proposalId]);
      await refresh();
      setNotice("Site publié. La publication figure dans les résultats.");
    } catch (error) { reportError(error); }
    finally { setBusyId(null); }
  }

  async function handleSaveDirection() {
    setDirectionSaving(true);
    setError(null);
    try {
      await request("/api/companies/direction", "POST", { direction });
      setNotice("Consigne enregistrée pour les prochaines actions.");
    } catch (error) { reportError(error); }
    finally { setDirectionSaving(false); }
  }

  async function handleSendChat(event: React.FormEvent) {
    event.preventDefault();
    if (!chatInput.trim() || chatSending) return;
    const userText = chatInput;
    setChatSending(true);
    setError(null);
    try {
      const { reply } = await request("/api/co-ceo/message", "POST", { companyId: company.id, message: userText });
      setChatInput("");
      setChatMessages((previous) => [
        ...previous,
        { id: `tmp-${Date.now()}`, companyId: company.id, role: "user", content: userText, createdAt: new Date() },
        { id: `tmp-${Date.now()}-a`, companyId: company.id, role: "assistant", content: reply, createdAt: new Date() },
      ]);
      await refresh();
    } catch (error) { reportError(error); }
    finally { setChatSending(false); }
  }

  const activeItems = planItems.filter((item) => item.status !== "ecarte" && item.status !== "termine");
  const closedItems = planItems.filter((item) => item.status === "ecarte" || item.status === "termine");
  const actionable = proposals.filter(needsAttention);
  const validationItems = proposals.filter((proposal) => needsAttention(proposal) || decidedIds.includes(proposal.id));
  const history = proposals.filter((proposal) => !needsAttention(proposal));
  const nextItem = activeItems.find((item) => item.status === "propose");
  const locked = busyId !== null || planLoading || chatSending;

  return (
    <div className="mx-auto max-w-4xl">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Aujourd&apos;hui</h1>
          <p className="mt-1 text-sm text-slate-500">{company.objective || "Votre activité, vos priorités"}</p>
        </div>
        <Link href="/rapport" className="text-sm font-medium text-indigo-600 underline underline-offset-4">Voir les résultats</Link>
      </header>
      <JourneyProgress
        objectiveComplete={Boolean(company.objective?.trim())}
        diagnosticComplete={initialDiagnosticCount > 0}
        planComplete={planItems.length > 0}
        workStarted={proposals.length > 0 || planItems.some((item) => ["lance", "termine"].includes(item.status))}
        needsValidation={actionable.length > 0}
        resultsAvailable={proposals.some((proposal) => proposal.status === "executee")}
        planLoading={planLoading}
        onPreparePlan={handleGeneratePlan}
      />
      <section className="mt-6 border-y border-slate-200 py-5" aria-labelledby="next-step">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Prochaine étape</p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
          <h2 id="next-step" className="max-w-xl text-lg font-medium">{actionable.length > 0 ? `${actionable.length} production(s) attendent votre décision` : nextItem ? nextItem.title : "Préparer les prochaines actions"}</h2>
          {actionable.length > 0 ? (
            <Link href="/dashboard?view=validation" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white">Examiner les productions</Link>
          ) : nextItem ? (
            <button onClick={() => handleLaunch(nextItem)} disabled={locked} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50">{busyId === nextItem.id ? "En préparation…" : "Lancer l'action"}</button>
          ) : (
            <button onClick={handleGeneratePlan} disabled={locked} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50">{planLoading ? "Paul réfléchit…" : "Préparer le plan"}</button>
          )}
        </div>
      </section>
      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      <nav aria-label="Actions" className="mt-6 flex flex-wrap gap-x-6 border-b border-slate-200">
        {([
          ["plan", "Plan d'action", activeItems.length],
          ["validation", "À valider", actionable.length],
          ["historique", "Historique", history.length],
        ] as const).map(([view, label, count]) => (
          <Link key={view} href={`/dashboard?view=${view}`} aria-current={initialView === view ? "page" : undefined} className={`border-b-2 py-3 text-sm font-medium ${initialView === view ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-900"}`}>
            {label} <span className="ml-1 text-xs">{count}</span>
          </Link>
        ))}
      </nav>
      {initialView === "plan" && (
        <section id="plan-actions" className="py-5" aria-label="Plan d'action">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-medium">Priorités de {PERSONAS.co_ceo.name}</h2>
            <button onClick={handleGeneratePlan} disabled={locked} className="text-sm font-medium text-indigo-600 underline underline-offset-4 disabled:opacity-50">{planLoading ? "Préparation…" : "Compléter le plan"}</button>
          </div>
          {activeItems.length === 0 && <p className="py-6 text-sm text-slate-500">Aucune action à lancer pour le moment.</p>}
          <ol className="divide-y divide-slate-200">
            {activeItems.map((item, index) => {
              const persona = PERSONAS[item.agent as AgentKey];
              const count = proposals.filter((proposal) => proposal.planItemId === item.id && needsAttention(proposal)).length;
              return (
                <li key={item.id} className="py-5">
                  <div className="flex flex-wrap items-start gap-3">
                    <span className="pt-1 text-sm text-slate-400">{index + 1}.</span>
                    <PersonaAvatar agentKey={item.agent as AgentKey} size={32} />
                    <div className="min-w-0 flex-1 basis-40">
                      <p className="text-xs text-slate-500">{persona?.name ?? item.agent} · {item.timing}</p>
                      <h3 className="mt-1 font-medium">{item.title}</h3>
                      <details className="mt-2 text-sm text-slate-600"><summary className="cursor-pointer text-xs">Pourquoi cette action ?</summary><p className="mt-2">{item.rationale}</p></details>
                    </div>
                    {item.status === "propose" ? (
                      <div className="flex items-center gap-3">
                        <button onClick={() => setDiscardingId(discardingId === item.id ? null : item.id)} disabled={locked} className="text-xs text-slate-500 disabled:opacity-50">Écarter</button>
                        <button onClick={() => handleLaunch(item)} disabled={locked} className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50">{busyId === item.id ? "En préparation…" : "Lancer"}</button>
                      </div>
                    ) : (
                      <Link href={count > 0 ? "/dashboard?view=validation" : "/dashboard?view=historique"} className="text-sm text-indigo-600 underline">{count > 0 ? `${count} à examiner` : "Voir la production"}</Link>
                    )}
                  </div>
                  {discardingId === item.id && (
                    <form onSubmit={(event) => { event.preventDefault(); void handleDiscard(item.id); }} className="mt-3 flex flex-wrap gap-2">
                      <input aria-label="Raison de l'abandon" placeholder="Pourquoi écarter cette action ?" value={discardReason} onChange={(event) => setDiscardReason(event.target.value)} className="min-w-0 flex-1 basis-48 rounded-lg border px-3 py-2 text-sm" />
                      <button disabled={locked} className="rounded-lg bg-slate-700 px-3 py-2 text-sm text-white disabled:opacity-50">Confirmer</button>
                    </form>
                  )}
                </li>
              );
            })}
          </ol>
          {closedItems.length > 0 && <Link href="/dashboard?view=historique" className="mt-4 inline-block text-sm text-slate-500 underline">{closedItems.length} action(s) traitée(s) ou écartée(s)</Link>}
        </section>
      )}
      {initialView === "validation" && (
        <section className="space-y-4 py-5" aria-label="Productions à valider">
          {validationItems.length === 0 && <p className="py-6 text-sm text-slate-500">Tout est à jour. Aucune production à valider ou à publier.</p>}
          {validationItems.map((proposal) => (
            <div key={proposal.id}>
              <p className="mb-2 text-xs text-slate-500">{planItems.find((item) => item.id === proposal.planItemId)?.title ?? "Demande ponctuelle à l'équipe"}</p>
              <ProposalCard proposal={proposal} onDecision={handleDecision} onExecute={handleExecute} busy={locked} showAgent riskSettings={riskSettings} />
            </div>
          ))}
        </section>
      )}
      {initialView === "historique" && (
        <section className="space-y-4 py-5" aria-label="Historique">
          <h2 className="font-medium">Productions traitées</h2>
          {history.length === 0 && <p className="text-sm text-slate-500">Aucune production traitée.</p>}
          {history.map((proposal) => <ProposalCard key={proposal.id} proposal={proposal} onDecision={handleDecision} busy={locked} showAgent riskSettings={riskSettings} />)}
          <h2 className="pt-4 font-medium">Actions terminées et écartées</h2>
          <ul className="divide-y divide-slate-200">
            {closedItems.map((item) => <li key={item.id} className="py-3 text-sm"><span className="text-xs text-slate-500">{item.status === "ecarte" ? "Écartée" : "Traitée"}</span><p className="font-medium">{item.title}</p>{item.feedback && <p className="mt-1 text-slate-500">{item.feedback}</p>}</li>)}
          </ul>
          <Link href="/diagnostic" className="inline-block text-sm text-indigo-600 underline">Consulter le diagnostic</Link>
        </section>
      )}
      <details className="mt-6 border-t border-slate-200 py-5">
        <summary className="flex cursor-pointer items-center gap-3 font-medium"><PersonaAvatar agentKey="co_ceo" size={32} />Faire le point avec {PERSONAS.co_ceo.name}</summary>
        <div className="mt-5 grid gap-6 lg:grid-cols-2">
          <section>
            <label htmlFor="direction" className="text-sm font-medium">Consigne pour l&apos;équipe</label>
            <textarea id="direction" value={direction} onChange={(event) => setDirection(event.target.value)} placeholder="Priorités, contraintes, actualités…" rows={4} className="mt-2 w-full rounded-lg border px-3 py-2 text-sm" />
            <button onClick={handleSaveDirection} disabled={directionSaving} className="mt-2 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50">{directionSaving ? "Enregistrement…" : "Enregistrer la consigne"}</button>
          </section>
          <section className="min-w-0">
            <h2 className="text-sm font-medium">Conversation avec {PERSONAS.co_ceo.name}</h2>
            <div role="log" aria-label="Conversation" className="mt-2 max-h-80 space-y-3 overflow-y-auto py-2">
              {chatMessages.length === 0 && <p className="text-sm text-slate-500">Aucun échange pour le moment.</p>}
              {chatMessages.map((message) => <p key={message.id} className={`whitespace-pre-wrap break-words text-sm ${message.role === "user" ? "text-indigo-700" : "text-slate-600"}`}><span className="block text-xs font-medium">{message.role === "user" ? "Vous" : PERSONAS.co_ceo.name}</span>{message.content}</p>)}
              {chatSending && <p className="text-sm text-slate-500">Paul réfléchit…</p>}
            </div>
            <form onSubmit={handleSendChat} className="mt-3 flex gap-2">
              <input aria-label="Message à Paul" placeholder="Écrire à Paul…" value={chatInput} onChange={(event) => setChatInput(event.target.value)} className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm" />
              <button type="submit" disabled={locked || !chatInput.trim()} className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50">Envoyer</button>
            </form>
          </section>
        </div>
      </details>
    </div>
  );
}