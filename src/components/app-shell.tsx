import Link from "next/link";
import { SidebarNav } from "@/components/sidebar-nav";

/** Coque commune des pages connectées : barre latérale (parcours lisible) + contenu. */
export function AppShell({
  companyName,
  children,
}: {
  companyName?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-slate-50 font-sans text-slate-900">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white p-4 md:flex">
        <Link href="/dashboard" className="mb-6 block px-3">
          <span className="text-lg font-semibold">BienDecider</span>
          {companyName && (
            <span className="block truncate text-xs text-slate-500">{companyName}</span>
          )}
        </Link>
        <SidebarNav />
        <form action="/api/auth/logout" method="post" className="mt-auto px-3 pt-6">
          <button type="submit" className="text-xs text-slate-400 hover:text-slate-700">
            Déconnexion
          </button>
        </form>
        <div className="flex flex-wrap gap-2 px-3 pt-2 text-[10px] text-slate-300">
          <Link href="/cgu" className="hover:text-slate-500">CGU</Link>
          <Link href="/confidentialite" className="hover:text-slate-500">Confidentialité</Link>
          <Link href="/mentions-legales" className="hover:text-slate-500">Mentions légales</Link>
          <a href="mailto:contact@biendecider.com" className="hover:text-slate-500">Contact</a>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/dashboard" className="font-semibold">BienDecider</Link>
          <div className="flex min-w-0 items-center gap-3">
            {companyName && <span className="max-w-28 truncate text-xs text-slate-500">{companyName}</span>}
            <Link href="/dashboard?view=validation" className="inline-flex min-h-11 shrink-0 items-center rounded border border-indigo-200 px-3 text-sm font-medium text-indigo-700">À valider</Link>
          </div>
          </div>
          <details className="mt-3">
            <summary className="cursor-pointer py-1 text-sm font-medium text-slate-600">Menu</summary>
            <SidebarNav />
            <form action="/api/auth/logout" method="post" className="px-3 py-4"><button className="text-sm text-slate-500">Déconnexion</button></form>
          </details>
        </header>
        <main className="mx-auto max-w-6xl break-words p-4 sm:p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}
