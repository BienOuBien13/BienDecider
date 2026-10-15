"use client";

import { openPaul, type PaulElement } from "@/lib/paul-context";

export function AskPaulButton({ element }: { element: PaulElement }) {
  return (
    <button type="button" onClick={() => openPaul(element)} className="min-h-11 text-sm text-indigo-700 underline">
      Demander à Paul
    </button>
  );
}
