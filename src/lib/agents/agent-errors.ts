/**
 * Un agent a tourné sans rien produire d'exploitable. Échec silencieux réel
 * observé en prod (2026-10-05, "La Tonnelle") : 32k tokens consommés, aucune
 * proposition, et l'action passait pour réussie. Tous les agents lèvent
 * cette erreur plutôt que de renvoyer un résultat vide ou un faux constat.
 */
export class AgentNoResultError extends Error {
  constructor(agentName: string) {
    super(`${agentName} n'a pas pu produire de résultat exploitable cette fois-ci. Réessayez.`);
    this.name = "AgentNoResultError";
  }
}

export function ensureAgentProduced(
  agentName: string,
  producedCount: number,
  diagnostics: { stopReason: unknown; usage: unknown },
) {
  if (producedCount > 0) return;
  console.warn(`${agentName} n'a rien produit — stop_reason: ${String(diagnostics.stopReason)}, usage total:`, diagnostics.usage);
  throw new AgentNoResultError(agentName);
}

/**
 * Message affichable au dirigeant quand un agent échoue. Les erreurs
 * techniques (fournisseur du modèle, réseau, base) ne sont jamais
 * recopiées telles quelles : elles restent dans les logs serveur.
 */
export function agentFailureMessage(error: unknown, agentName: string): string {
  return error instanceof AgentNoResultError
    ? error.message
    : `${agentName} est indisponible pour le moment. Réessayez dans quelques minutes.`;
}
