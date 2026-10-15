"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/diagnostic", label: "Diagnostic", group: "Activité" },
  { href: "/dashboard", label: "Aujourd'hui", group: "Activité" },
  { href: "/prospection", label: "Prospection", group: "Activité" },
  { href: "/rapport", label: "Résultats", group: "Activité" },
  { href: "/equipe", label: "Équipe", group: "Organisation" },
  { href: "/connexions", label: "Connexions", group: "Organisation" },
  { href: "/entreprise", label: "Mon entreprise", group: "Organisation" },
  { href: "/admin", label: "Administration", group: "Organisation" },
];

export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Navigation principale" className="flex flex-col gap-1">
      {ITEMS.map((item, index) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <div key={item.href}>
          {(index === 0 || ITEMS[index - 1].group !== item.group) && <p className="px-3 pb-2 pt-5 text-xs font-medium uppercase tracking-wide text-slate-600">{item.group}</p>}
          <Link
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`block min-h-11 rounded-lg px-3 py-2.5 text-sm transition ${
              active
                ? "bg-indigo-600 text-white"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <span className="block font-medium">{item.label}</span>
          </Link>
          </div>
        );
      })}
    </nav>
  );
}
