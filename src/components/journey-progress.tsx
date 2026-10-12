"use client";

import Link from "next/link";
import { useState } from "react";

type Props = {
  objectiveComplete: boolean;
  diagnosticComplete: boolean;
  planComplete: boolean;
  workStarted: boolean;
  needsValidation: boolean;
  resultsAvailable: boolean;
  planLoading: boolean;
  onPreparePlan: () => void;
};

export function JourneyProgress({
  objectiveComplete,
  diagnosticComplete,
  planComplete,
  workStarted,
  needsValidation,
  resultsAvailable,
  planLoading,
  onPreparePlan,
}: Props) {
  const [visible, setVisible] = useState(true);
  const [showCompletedDetails, setShowCompletedDetails] = useState(false);
  const steps = [
    { label: "Objectif", complete: objectiveComplete },
    { label: "Diagnostic", complete: diagnosticComplete },
    { label: "Plan", complete: planComplete },
    { label: "Validation", complete: workStarted && !needsValidation },
    { label: "Résultats", complete: resultsAvailable },
  ];
  const completedCount = steps.filter((step) => step.complete).length;
  const complete = completedCount === steps.length;
  const currentIndex = steps.findIndex((step) => !step.complete);

  if (!visible) {
    return (
      <section aria-label="Votre parcours" className="mt-4 flex items-center justify-between gap-3 border-y border-slate-200 py-3">
        <p className="text-sm text-slate-600">Parcours {complete ? "terminé" : `${completedCount}/5 étapes terminées`}</p>
        <button type="button" onClick={() => setVisible(true)} className="text-sm text-indigo-700 underline underline-offset-4">
          Afficher le parcours
        </button>
      </section>
    );
  }

  if (complete && !showCompletedDetails) {
    return (
      <section aria-label="Votre parcours" className="mt-4 flex flex-wrap items-center justify-between gap-3 border-y border-slate-200 py-3">
        <p className="text-sm text-slate-600">Premier cycle terminé · 5/5 étapes</p>
        <div className="flex items-center gap-4">
          <Link href="/rapport" className="text-sm text-indigo-700 underline underline-offset-4">Voir les résultats</Link>
          <button type="button" onClick={() => setShowCompletedDetails(true)} className="text-sm text-slate-600 underline underline-offset-4">
            Détails
          </button>
          <button type="button" onClick={() => setVisible(false)} className="text-sm text-slate-600 underline underline-offset-4">
            Masquer
          </button>
        </div>
      </section>
    );
  }

  const currentStep = steps[currentIndex];
  return (
    <section aria-label="Votre parcours" className="mt-4 border-y border-slate-200 py-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Votre parcours</h2>
          <p className="mt-1 text-xs text-slate-500">
            {complete ? "Votre premier cycle est terminé." : `Étape ${currentIndex + 1} sur ${steps.length} · ${currentStep.label}`}
          </p>
        </div>
        <button type="button" onClick={() => setVisible(false)} className="text-xs text-slate-500 underline underline-offset-4">
          Masquer le parcours
        </button>
      </header>
      <div role="progressbar" aria-label="Avancement du parcours" aria-valuemin={0} aria-valuemax={5} aria-valuenow={completedCount} className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-emerald-600" style={{ width: `${(completedCount / steps.length) * 100}%` }} />
      </div>
      <ol className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3 md:grid-cols-5">
        {steps.map((step, index) => {
          const current = !complete && index === currentIndex;
          return (
            <li key={step.label} aria-current={current ? "step" : undefined} className="flex min-w-0 items-center gap-2 py-1">
              <span className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${step.complete ? "bg-emerald-100 text-emerald-800" : current ? "bg-indigo-100 text-indigo-800" : "bg-slate-100 text-slate-500"}`}>
                {step.complete ? "✓" : index + 1}
              </span>
              <span className={`truncate text-xs ${current ? "font-semibold text-slate-900" : "text-slate-600"}`}>{step.label}</span>
            </li>
          );
        })}
      </ol>
      {!complete && currentStep && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <p className="text-sm text-slate-700">Prochaine étape : <span className="font-medium">{currentStep.label}</span></p>
          {currentIndex === 0 ? (
            <Link href="/onboarding" className="text-sm font-medium text-indigo-700 underline underline-offset-4">Compléter mon objectif</Link>
          ) : currentIndex === 1 ? (
            <Link href="/diagnostic" className="text-sm font-medium text-indigo-700 underline underline-offset-4">Lancer le diagnostic</Link>
          ) : currentIndex === 2 && !planComplete ? (
            <button type="button" onClick={onPreparePlan} disabled={planLoading} className="text-sm font-medium text-indigo-700 underline underline-offset-4 disabled:opacity-50">
              {planLoading ? "Préparation…" : "Préparer le plan"}
            </button>
          ) : currentIndex === 3 && needsValidation ? (
            <Link href="/dashboard?view=validation" className="text-sm font-medium text-indigo-700 underline underline-offset-4">Examiner les productions</Link>
          ) : currentIndex === 3 ? (
            <Link href="/dashboard#plan-actions" className="text-sm font-medium text-indigo-700 underline underline-offset-4">Lancer une action du plan</Link>
          ) : (
            <Link href="/rapport" className="text-sm font-medium text-indigo-700 underline underline-offset-4">Consulter les résultats</Link>
          )}
        </div>
      )}
      {complete && <Link href="/rapport" className="mt-3 inline-block text-sm font-medium text-indigo-700 underline underline-offset-4">Voir les résultats</Link>}
    </section>
  );
}