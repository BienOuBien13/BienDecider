"use client";

import { PageStatus } from "@/components/page-status";

export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <PageStatus title="La page n'a pas pu s'afficher" message="Un problème temporaire est survenu. Vous pouvez réessayer ou revenir à l'accueil.">
      <button type="button" onClick={retry} className="rounded bg-indigo-700 px-4 py-2 text-sm font-medium text-white">Réessayer</button>
    </PageStatus>
  );
}