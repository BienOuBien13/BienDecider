export type QueueFilter = "all" | "a_relire" | "approuvees" | "a_verifier";

export type QueueItem = { id: string; planItemId: string | null; status: string };
export type QueueGroup<T extends QueueItem> = { key: string; title: string; items: T[] };

export const UNATTACHED_GROUP_TITLE = "Demandes ponctuelles à l'équipe";

export const FILTER_LABELS: Record<QueueFilter, string> = {
  all: "Toutes",
  a_relire: "À relire",
  approuvees: "Approuvées",
  a_verifier: "À vérifier",
};

export function matchesFilter(status: string, filter: QueueFilter) {
  switch (filter) {
    case "a_relire":
      return status === "en_attente";
    case "approuvees":
      return status === "validee" || status === "modifiee";
    case "a_verifier":
      return ["envoi_en_cours", "envoi_incertain", "publication_en_cours", "publication_incertaine"].includes(status);
    default:
      return true;
  }
}

/** Nombre par filtre, calculé sur toute la file : un filtre ne masque jamais ce qu'il reste à traiter. */
export function countByFilter(items: QueueItem[]): Record<QueueFilter, number> {
  const counts: Record<QueueFilter, number> = { all: items.length, a_relire: 0, approuvees: 0, a_verifier: 0 };
  for (const item of items) {
    for (const filter of ["a_relire", "approuvees", "a_verifier"] as const) {
      if (matchesFilter(item.status, filter)) counts[filter]++;
    }
  }
  return counts;
}

/** Regroupe par action du plan ; les productions sans action forment un groupe explicite, placé en dernier. */
export function groupQueue<T extends QueueItem>(items: T[], filter: QueueFilter, titles: Map<string, string>): QueueGroup<T>[] {
  const groups = new Map<string, QueueGroup<T>>();
  for (const item of items.filter((entry) => matchesFilter(entry.status, filter))) {
    const key = item.planItemId && titles.has(item.planItemId) ? item.planItemId : "ponctuelle";
    const group = groups.get(key) ?? { key, title: key === "ponctuelle" ? UNATTACHED_GROUP_TITLE : titles.get(key)!, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => Number(a.key === "ponctuelle") - Number(b.key === "ponctuelle"));
}
