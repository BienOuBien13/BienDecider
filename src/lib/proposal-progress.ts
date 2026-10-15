export type ProgressProposal = { status: string; kind: string };

export type ProposalProgress = {
  total: number;
  toReview: number;
  inProgress: number;
  uncertain: number;
  /** Approuvées que BienDecider peut mettre en ligne, pas encore réalisées. */
  toPublish: number;
  /** Approuvées sans publication automatique : à réaliser manuellement. */
  manual: number;
  executed: number;
  rejected: number;
};

export function summarizeProposals(proposals: ProgressProposal[]): ProposalProgress {
  const progress: ProposalProgress = { total: proposals.length, toReview: 0, inProgress: 0, uncertain: 0, toPublish: 0, manual: 0, executed: 0, rejected: 0 };
  for (const { status, kind } of proposals) {
    if (status === "en_attente") progress.toReview++;
    else if (status === "envoi_en_cours" || status === "publication_en_cours") progress.inProgress++;
    else if (status === "envoi_incertain" || status === "publication_incertaine") progress.uncertain++;
    else if (status === "executee") progress.executed++;
    else if (status === "rejetee") progress.rejected++;
    else if (status === "validee" || status === "modifiee") {
      if (kind === "site_web_content") progress.toPublish++;
      else progress.manual++;
    }
  }
  return progress;
}

/** Une action est terminée quand plus rien n'attend une décision ou une mise en ligne et que tout n'a pas été rejeté. */
export function isActionDone(proposals: ProgressProposal[]) {
  const progress = summarizeProposals(proposals);
  return progress.total > 0 && progress.rejected < progress.total &&
    progress.toReview + progress.inProgress + progress.uncertain + progress.toPublish === 0;
}

export function describeProgress(progress: ProposalProgress) {
  return [
    progress.toReview > 0 && `${progress.toReview} à relire`,
    progress.toPublish > 0 && `${progress.toPublish} approuvée(s), à mettre en ligne`,
    progress.manual > 0 && `${progress.manual} approuvée(s), à réaliser vous-même`,
    progress.inProgress > 0 && `${progress.inProgress} en cours d'envoi ou de publication`,
    progress.uncertain > 0 && `${progress.uncertain} à vérifier (résultat incertain)`,
    progress.executed > 0 && `${progress.executed} réalisée(s)`,
    progress.rejected > 0 && `${progress.rejected} rejetée(s)`,
  ].filter((part): part is string => Boolean(part));
}
