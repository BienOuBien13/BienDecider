/**
 * Personnification des agents (cf. docs/backlog.md). Équipe rationalisée le
 * 2026-10-05 (demande CEO) : Nadia (audit) fusionnée dans Martine, qui
 * devient Marketing Officer (diagnostic + pilotage de la fiche Google) ;
 * Camille se recentre sur la production de contenu (posts, site), en
 * s'appuyant sur les constats de Martine.
 *
 * Paul (ex-"Co-CEO") renommé "Partenaire de croissance" le 2026-10-07 —
 * cf. docs/backlog.md "partenaire de croissance" : "Co-CEO" évoquait un
 * statut hiérarchique factice, alors que son rôle réel (et celui qui doit
 * se lire dans son prompt, pas seulement dans son étiquette) est de
 * comprendre le métier et le marché du dirigeant, l'aider à fixer un
 * objectif chiffré, décider des priorités, déléguer, mesurer et apprendre
 * de ce qui fonctionne. Toujours pas de prénom donnant un genre marqué
 * inutilement par ailleurs — "Paul" reste un prénom neutre dans ce choix.
 *
 * "humeur" = un trait de personnalité fixe qui infuse le ton de l'agent
 * (pas un indicateur d'humeur dynamique en V1 — complexité non justifiée
 * tant qu'on rationalise l'équipe plutôt que l'inverse).
 *
 * Pas de photos réalistes : aucune génération d'image disponible, et une
 * fausse photo de personne réelle pour une IA serait trompeuse si elle
 * sort un jour du dashboard (cf. décision actée dans backlog.md). Chaque
 * agent a une illustration propre (PersonaAvatar) plutôt qu'une pastille
 * générique.
 */
import { businessTargetLines } from "@/lib/business-target";

export const PERSONAS = {
  co_ceo: {
    name: "Paul",
    role: "Partenaire de croissance",
    trait: "Direct et synthétique, ne promet jamais ce qu'il ne peut pas faire.",
    blurb:
      "Je comprends votre métier et votre marché, je fixe avec vous un objectif chiffré, je décide des priorités, je délègue aux bons agents, je mesure ce que ça produit et j'ajuste la suite — toujours avec votre validation avant toute action réelle.",
  },
  marketing: {
    name: "Martine",
    role: "Marketing Officer",
    trait: "Analytique et sans détour — elle dit ce qui ne marche pas avant ce qui marche.",
    blurb:
      "J'audite votre présence en ligne, je regarde vos concurrents, et je pilote votre fiche Google (infos, avis) pour que vous ressortiez mieux qu'eux en local.",
  },
  contenu: {
    name: "Camille",
    role: "Contenu & Site",
    trait: "Créative et concrète — elle préfère un brouillon imparfait à une idée jamais écrite.",
    blurb:
      "Je transforme les constats de Martine en contenu prêt à l'emploi : vos posts Instagram/Facebook et votre site web.",
  },
  demarchage: {
    name: "Jean-Claude",
    role: "Démarchage",
    trait: "Tenace et terre-à-terre, jamais dans la promesse commerciale exagérée.",
    blurb:
      "Je repère des pistes de croissance (actualités locales, événements) et je prépare des templates de prospection pour aller chercher de nouveaux clients.",
  },
} as const;

export type AgentKey = keyof typeof PERSONAS;

/**
 * Objectif business à injecter dans les prompts : phrase libre du dirigeant
 * + écart chiffré (CA actuel / cible / clients nécessaires) si renseigné.
 */
export function objectiveLine(
  company: { objective: string | null } & Parameters<typeof businessTargetLines>[0],
): string {
  const parts: string[] = [];
  if (company.objective) {
    parts.push(`Objectif business du dirigeant : ${company.objective}. Oriente tes propositions vers cet objectif en priorité.`);
  }
  const numbers = businessTargetLines(company);
  if (numbers) parts.push(numbers);
  return parts.join("\n");
}

type CompanyProfileFields = {
  description?: string | null;
  phone?: string | null;
  certifications?: string | null;
  openingHours?: string | null;
};

/**
 * Profil libre de l'entreprise (remplace l'ancien champ "tone" figé) —
 * description, téléphone, certifications, horaires, uniquement les champs
 * renseignés. Le ton de communication se déduit de la description elle-même.
 */
export function companyProfileLines(company: CompanyProfileFields): string {
  const lines: string[] = [];
  if (company.description) lines.push(`Description donnée par le dirigeant : ${company.description}`);
  if (company.phone) lines.push(`Téléphone à afficher : ${company.phone}`);
  if (company.certifications) lines.push(`Certifications/labels : ${company.certifications}`);
  if (company.openingHours) lines.push(`Horaires d'ouverture : ${company.openingHours}`);
  return lines.join("\n");
}

/** Consigne de réorientation du dirigeant — prime sur tout le reste. */
export function directionLine(direction: string | null): string {
  return direction
    ? `CONSIGNE DU DIRIGEANT (prioritaire) : ${direction}`
    : "";
}

/** Options communes de lancement d'un agent depuis le plan de Paul. */
export type AgentRunOptions = {
  /** Action du plan à réaliser — l'agent doit s'y tenir plutôt que de proposer autre chose. */
  brief?: string;
  /** Rattache les propositions créées à l'action du plan correspondante. */
  planItemId?: string;
  /** Run persistant qui a créé les éléments produits. */
  agentRunId?: string;
};

export function briefLine(brief?: string): string {
  return brief
    ? `ACTION DEMANDÉE PAR PAUL : ${brief}\nTes propositions doivent réaliser précisément cette action, pas autre chose.`
    : "";
}

