"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { AgentRunView } from "@/lib/agent-run-types";
import { waitForAgentRun } from "@/lib/agent-runs-client";
import {
  agentName, describeRunProgress, finishedRunMessage, formatDuration, isActiveRun, recentSucceededRuns, runResultHref,
} from "@/lib/agent-run-progress";

type MonitorHandlers = {
  onUpdate: (run: AgentRunView) => void;
  onFinished: (run: AgentRunView) => void | Promise<void>;
  onError: (error: unknown) => void;
};

/** Suit une exécution jusqu'à sa fin et reprend celles déjà en cours quand on revient sur la page. */
export function useAgentRunMonitor(initialRuns: AgentRunView[], handlers: MonitorHandlers) {
  const handlersRef = useRef(handlers);
  const controllerRef = useRef<AbortController | null>(null);
  const resumeIds = useRef(initialRuns.filter(isActiveRun).map((run) => run.id));

  useEffect(() => { handlersRef.current = handlers; });

  const monitor = useCallback(async (runId: string) => {
    try {
      const finished = await waitForAgentRun(runId, (run) => handlersRef.current.onUpdate(run), controllerRef.current?.signal);
      if (finished) await handlersRef.current.onFinished(finished);
    } catch (error) { handlersRef.current.onError(error); }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    for (const runId of resumeIds.current) void monitor(runId);
    return () => controller.abort();
  }, [monitor]);

  return monitor;
}

// Une seule horloge partagée, active seulement tant qu'une exécution est affichée ; 0 côté serveur pour éviter un décalage à l'hydratation.
let clockNow = 0;
let clockTimer: ReturnType<typeof setInterval> | null = null;
const clockListeners = new Set<() => void>();

function subscribeClock(listener: () => void) {
  clockListeners.add(listener);
  if (!clockTimer) {
    clockNow = Date.now();
    clockTimer = setInterval(() => {
      clockNow = Date.now();
      clockListeners.forEach((notify) => notify());
    }, 1000);
  }
  return () => {
    clockListeners.delete(listener);
    if (clockListeners.size === 0 && clockTimer) {
      clearInterval(clockTimer);
      clockTimer = null;
    }
  };
}

function useClock() {
  return useSyncExternalStore(subscribeClock, () => clockNow, () => 0);
}

function ActiveRun({ run, onCheck }: { run: AgentRunView; onCheck: (runId: string) => void }) {
  const clock = useClock();
  const progress = describeRunProgress(run, clock || new Date(run.startedAt ?? run.queuedAt).getTime());
  return (
    <li className="py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p><span className="font-medium">{agentName(run.agent)}</span> : {progress.headline}{clock > 0 && <span className="text-slate-600"> · depuis {formatDuration(progress.elapsedSeconds)}</span>}</p>
        <button onClick={() => onCheck(run.id)} className="min-h-11 text-indigo-700 underline">Vérifier</button>
      </div>
      <ol className="mt-1 space-y-0.5 text-xs text-slate-700">
        {progress.steps.map((step) => (
          <li key={step.label} aria-current={step.state === "active" ? "step" : undefined} className={step.state === "active" ? "font-medium text-slate-900" : undefined}>
            <span aria-hidden="true">{step.state === "done" ? "✓" : step.state === "active" ? "●" : "○"}</span> {step.label}
            <span className="sr-only"> ({step.state === "done" ? "estimée terminée" : step.state === "active" ? "en cours" : "à venir"})</span>
          </li>
        ))}
      </ol>
      <p className="mt-1 text-xs text-slate-600">{progress.hint} Étapes indicatives. Vous pouvez quitter cette page : le résultat sera retrouvé ici.</p>
    </li>
  );
}

export function AgentRunTracker({ runs, onCheck, onRetry, retryDisabled }: {
  runs: AgentRunView[];
  onCheck: (runId: string) => void;
  onRetry?: (run: AgentRunView) => void;
  retryDisabled?: boolean;
}) {
  const [openedAt] = useState(() => Date.now());
  const active = runs.filter(isActiveRun);
  const failed = runs.filter((run) => run.status === "failed");
  const succeeded = recentSucceededRuns(runs, openedAt);
  if (active.length + failed.length + succeeded.length === 0) return null;

  return (
    <section className="mt-4 border-b border-slate-200 pb-4" aria-label="Exécutions récentes">
      <h2 className="text-sm font-medium">Exécutions récentes</h2>
      <ul className="mt-2 divide-y divide-slate-100 text-sm">
        {active.slice(0, 5).map((run) => <ActiveRun key={run.id} run={run} onCheck={onCheck} />)}
        {failed.slice(0, 3).map((run) => (
          <li key={run.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span><span className="font-medium">{agentName(run.agent)}</span> : {run.errorMessage ?? "Échec, relançable"}</span>
            {onRetry && run.agent === "co_ceo" && <button onClick={() => onRetry(run)} disabled={retryDisabled} className="min-h-11 text-indigo-700 underline disabled:opacity-50">Relancer Paul</button>}
          </li>
        ))}
        {succeeded.map((run) => (
          <li key={run.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>{finishedRunMessage(run)}</span>
            {(run.agent === "co_ceo" || run.resultCount > 0) && <Link href={runResultHref(run)} className="min-h-11 text-indigo-700 underline">Voir le résultat</Link>}
          </li>
        ))}
      </ul>
    </section>
  );
}
