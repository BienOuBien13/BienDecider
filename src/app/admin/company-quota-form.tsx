"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Limits = {
  dailyAgentRunLimit: number;
  monthlyAgentRunLimit: number;
  dailySpendLimitUsd: number;
  monthlySpendLimitUsd: number;
};

export function CompanyQuotaForm({
  companyId,
  limits,
  dailyRuns,
  monthlyRuns,
  dailyCost,
  monthlyCost,
  reservedCost,
}: { companyId: string; limits: Limits; dailyRuns: number; monthlyRuns: number; dailyCost: number; monthlyCost: number; reservedCost: number }) {
  const router = useRouter();
  const [values, setValues] = useState(limits);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(`/api/admin/companies/${companyId}/limits`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Impossible d'enregistrer les plafonds.");
      setMessage("Enregistré");
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Impossible d'enregistrer les plafonds.");
    } finally {
      setSaving(false);
    }
  }

  function numberField(key: keyof Limits, label: string, step = "1") {
    return <label className="block min-w-24 text-xs text-slate-600">
      {label}
      <input aria-label={label} type="number" min="0" step={step} value={values[key]} onChange={(event) => setValues((previous) => ({ ...previous, [key]: Number(event.target.value) }))} className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-900" />
    </label>;
  }

  return <form onSubmit={save} className="min-w-[22rem] space-y-2">
    <div className="grid grid-cols-2 gap-2">
      {numberField("dailyAgentRunLimit", "Runs/jour")}
      {numberField("monthlyAgentRunLimit", "Runs/mois")}
      {numberField("dailySpendLimitUsd", "USD/jour", "0.01")}
      {numberField("monthlySpendLimitUsd", "USD/mois", "0.01")}
    </div>
    <p className="text-xs text-slate-500">Jour UTC : {dailyRuns}/{limits.dailyAgentRunLimit} runs · ${dailyCost.toFixed(2)} utilisés + ${reservedCost.toFixed(2)} réservés</p>
    <p className="text-xs text-slate-500">Mois UTC : {monthlyRuns}/{limits.monthlyAgentRunLimit} runs · ${monthlyCost.toFixed(2)} utilisés + ${reservedCost.toFixed(2)} réservés</p>
    <div className="flex items-center gap-2">
      <button type="submit" disabled={saving} className="rounded bg-slate-900 px-2.5 py-1.5 text-xs text-white disabled:opacity-50">{saving ? "…" : "Enregistrer"}</button>
      {message && <span role="status" className="text-xs text-emerald-700">{message}</span>}
      {error && <span role="alert" className="text-xs text-red-700">{error}</span>}
    </div>
  </form>;
}