"use client";

import Link from "next/link";
import { useState } from "react";
import { PERSONAS, type AgentKey } from "@/lib/agents/personas";
import { PersonaAvatar } from "@/components/persona-avatar";
import { useAgentProfileCompletion } from "@/components/agent-profile-completion";

export function EquipeClient() {
  const { requestProfile, profileDialog, checking } = useAgentProfileCompletion();
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [newsContext, setNewsContext] = useState("");
  const [prospectDescription, setProspectDescription] = useState("");

  async function run(key: "contenu" | "demarchage") {
    setRunning(key);
    setError(null);
    setDone(false);
    try {
      const response = await fetch(`/api/agents/${key}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(key === "contenu" ? { newsContext: newsContext || undefined } : { prospectDescription: prospectDescription || undefined }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "La demande a échoué. Réessayez.");
      setDone(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : "La demande a échoué.");
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold">Équipe</h1>
        <Link href="/dashboard" className="text-sm font-medium text-indigo-600 underline">Voir le plan d&apos;action</Link>
      </header>
      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {done && <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Demande traitée. <Link href="/dashboard?view=validation" className="font-medium underline">Examiner les productions</Link></p>}
      {profileDialog}
      <div className="mt-6 divide-y divide-slate-200 border-t border-slate-200">
        {(["co_ceo", "marketing", "contenu", "demarchage"] as AgentKey[]).map((key) => {
          const persona = PERSONAS[key];
          return (
            <section key={key} className="py-6">
              <div className="flex items-start gap-3">
                <PersonaAvatar agentKey={key} size={48} />
                <div className="min-w-0">
                  <h2 className="text-lg font-medium">{persona.name}</h2>
                  <p className="text-sm text-slate-600">{persona.role}</p>
                  <p className="mt-1 text-sm text-slate-500">{persona.blurb}</p>
                </div>
              </div>
              {key === "co_ceo" ? (
                <Link href="/dashboard" className="mt-4 inline-block text-sm text-indigo-600 underline">Retrouver Paul et les priorités</Link>
              ) : key === "marketing" ? (
                <Link href="/diagnostic" className="mt-4 inline-block text-sm text-indigo-600 underline">Ouvrir le diagnostic de Martine</Link>
              ) : (
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm font-medium text-indigo-600">Demande ponctuelle</summary>
                  <form onSubmit={(event) => { event.preventDefault(); void requestProfile(key, () => run(key)); }} className="mt-3 flex flex-wrap items-end gap-3">
                    <label className="min-w-0 flex-1 basis-60 text-xs font-medium text-slate-600">
                      {key === "contenu" ? "Actualité à communiquer (facultatif)" : "Prospects visés (facultatif)"}
                      <input value={key === "contenu" ? newsContext : prospectDescription} onChange={(event) => key === "contenu" ? setNewsContext(event.target.value) : setProspectDescription(event.target.value)} className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm" />
                    </label>
                    <button disabled={running !== null || checking} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50">{running === key ? "En préparation…" : "Confier la demande"}</button>
                  </form>
                </details>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}