"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const message =
          data && typeof data.error === "string"
            ? data.error
            : "Service de connexion indisponible. Réessayez dans quelques instants.";
        throw new Error(message);
      }
      if (!data || typeof data.hasCompany !== "boolean") {
        throw new Error("Réponse de connexion invalide. Réessayez dans quelques instants.");
      }
      router.push(data.hasCompany ? "/dashboard" : "/onboarding");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connexion impossible, réessayez.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-sm flex-col justify-center p-8 font-sans min-h-screen">
      <h1 className="text-2xl font-semibold">BienDecider</h1>
      <p className="mt-1 text-sm text-gray-500">
        Première visite ? Entrez l&apos;email et le mot de passe que vous
        voulez utiliser — votre compte est créé automatiquement.
      </p>
      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
        <input
          required
          type="email"
          placeholder="votre@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded border px-3 py-2 text-sm"
        />
        <input
          required
          type="password"
          placeholder="Mot de passe (6 caractères minimum)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded border px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          {loading ? "Connexion…" : "Continuer"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </main>
  );
}
