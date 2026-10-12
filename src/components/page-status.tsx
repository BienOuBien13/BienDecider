import Link from "next/link";
import type { ReactNode } from "react";

export function PageStatus({ title, message, loading = false, children }: {
  title: string;
  message: string;
  loading?: boolean;
  children?: ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center bg-slate-50 px-4 py-12 font-sans text-slate-900">
      <div className="mx-auto w-full max-w-lg border-t-4 border-indigo-600 pt-6">
        <Link href="/" className="text-lg font-semibold text-indigo-700">BienDecider</Link>
        <div role={loading ? "status" : undefined} aria-live={loading ? "polite" : undefined} className="mt-8">
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">{message}</p>
          {loading && <div aria-hidden="true" className="mt-5 h-1 w-24 animate-pulse rounded bg-indigo-600 motion-reduce:animate-none" />}
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          {children}
          <Link href="/" className="text-sm font-medium text-indigo-700 underline underline-offset-4">Retour à l&apos;accueil</Link>
        </div>
      </div>
    </main>
  );
}