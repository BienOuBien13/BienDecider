"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteAccountSection({ requiresPassword }: { requiresPassword: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/companies/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed, ...(requiresPassword ? { password } : {}) }),
      });
      if (response.ok) {
        router.replace("/login");
        return;
      }
      const data = await response.json().catch(() => null);
      setError(typeof data?.error === "string" ? data.error : "La suppression a échoué, réessayez.");
    } catch {
      setError("La suppression a échoué, réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="delete-account-title" className="mt-10 border-t border-slate-200 pt-6">
      <h2 id="delete-account-title" className="text-lg font-semibold">Supprimer mon compte et mes données</h2>
      <p className="mt-1 text-sm text-slate-600">
        Votre entreprise, votre diagnostic, votre plan, vos productions, vos prospects et vos connexions sont effacés
        définitivement, ainsi que les jetons d&apos;accès. Nous retirons l&apos;autorisation donnée à BienDecider chez Google et Meta
        quand c&apos;est possible. Le site publié par BienDecider est mis hors ligne ; ce qui a déjà été publié ou envoyé
        ailleurs (réseaux sociaux, emails) n&apos;est pas retiré.
      </p>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="mt-3 rounded border border-red-700 px-3 py-2 text-sm text-red-700">
          Supprimer mon compte…
        </button>
      ) : (
        <form onSubmit={handleDelete} className="mt-3 flex flex-col gap-3">
          {requiresPassword && (
            <label htmlFor="delete-password" className="flex flex-col gap-1 text-sm font-medium">
              Votre mot de passe
              <input
                id="delete-password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={1024}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="rounded border px-3 py-2 text-sm font-normal"
              />
            </label>
          )}
          <label htmlFor="delete-confirm" className="flex items-start gap-2 text-sm">
            <input id="delete-confirm" type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1" />
            Je comprends que cette suppression est définitive et ne peut pas être annulée.
          </label>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={busy || !confirmed || (requiresPassword && !password)} className="rounded bg-red-700 px-3 py-2 text-sm text-white disabled:opacity-50">
              {busy ? "Suppression…" : "Supprimer définitivement"}
            </button>
            <button type="button" onClick={() => { setOpen(false); setPassword(""); setConfirmed(false); setError(null); }} className="rounded border px-3 py-2 text-sm">
              Annuler
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
