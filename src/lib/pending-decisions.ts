export type DecisionProposal = { status: string; kind: string };

/** Une production attend le dirigeant : relecture, mise en ligne à confirmer ou résultat incertain à vérifier. */
export function needsAttention(proposal: DecisionProposal, facebookPageName: string | null) {
  const approved = ["validee", "modifiee"].includes(proposal.status);
  return proposal.status === "en_attente" ||
    proposal.status === "publication_incertaine" ||
    (proposal.kind === "site_web_content" && approved) ||
    (proposal.kind === "social_post" && approved && facebookPageName !== null);
}

export function countPendingDecisions(proposals: DecisionProposal[], facebookPageName: string | null) {
  return proposals.filter((proposal) => needsAttention(proposal, facebookPageName)).length;
}
