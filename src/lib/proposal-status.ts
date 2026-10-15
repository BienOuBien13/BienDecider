/**
 * Glossaire des états d'une production (US #97) : un mot par état, identique sur tous les écrans.
 * L'icône double la couleur : l'état ne repose jamais sur la couleur seule (US #94, #95).
 */
export type StatusTone = "attente" | "ok" | "neutre" | "alerte";

export type ProposalStatusView = { label: string; icon: string; tone: StatusTone };

// Types que BienDecider ne publie pas lui-même : une fois approuvés, le dirigeant les publie.
const MANUAL_KINDS = ["gbp_update", "review_reply", "prospecting_email"];

export function proposalStatusView(status: string, kind: string, facebookPageName: string | null = null): ProposalStatusView {
  switch (status) {
    case "en_attente":
      return { label: "À relire", icon: "✎", tone: "attente" };
    case "validee":
    case "modifiee": {
      const manual = MANUAL_KINDS.includes(kind) || (kind === "social_post" && facebookPageName === null);
      return manual
        ? { label: "À publier manuellement", icon: "→", tone: "attente" }
        : { label: "Approuvée", icon: "✓", tone: "ok" };
    }
    case "rejetee":
      return { label: "Rejetée", icon: "✕", tone: "neutre" };
    case "executee":
      return { label: kind === "gmail_email" ? "Envoyée" : "Publiée", icon: "✓", tone: "ok" };
    case "envoi_en_cours":
      return { label: "Envoi en cours", icon: "…", tone: "attente" };
    case "publication_en_cours":
      return { label: "Publication en cours", icon: "…", tone: "attente" };
    case "envoi_incertain":
      return { label: "Envoi à vérifier dans Gmail", icon: "!", tone: "alerte" };
    case "publication_incertaine":
      return { label: "Publication à vérifier sur Facebook", icon: "!", tone: "alerte" };
    default:
      return { label: status, icon: "•", tone: "neutre" };
  }
}

export const STATUS_TONE_CLASSES: Record<StatusTone, string> = {
  attente: "bg-amber-100 text-amber-900",
  ok: "bg-emerald-100 text-emerald-900",
  neutre: "bg-slate-100 text-slate-700",
  alerte: "bg-rose-100 text-rose-900",
};
