import { prisma } from "@/lib/prisma";
import { canExecuteAction } from "@/lib/delegation-risk";
import { decryptFacebookAccount, publishFacebookPagePost } from "@/lib/oauth/meta";
import { PublishRefusedError } from "@/lib/execution-error";

const APPROVED = ["validee", "modifiee"];

/**
 * Publie sur la Page Facebook connectée une publication approuvée par le
 * dirigeant (US #11). Seule la version approuvée et confirmée par
 * l'interface est publiée. La proposition est réservée avant l'appel à
 * Meta : un double clic ou deux onglets ne publient qu'une fois. Un
 * résultat incertain n'est jamais relancé automatiquement.
 */
export async function publishProposalToFacebook(
  proposalId: string, companyId: string, expectedVersion: number,
  { configuredRiskLevel, fetchImpl = fetch }: { configuredRiskLevel?: string | null; fetchImpl?: typeof fetch } = {},
) {
  const proposal = await prisma.agentProposal.findFirst({ where: { id: proposalId, companyId } });
  if (!proposal) throw new PublishRefusedError("Proposition introuvable.", 404);
  if (proposal.kind !== "social_post") throw new PublishRefusedError("Seule une publication peut être publiée sur Facebook.", 400);
  if (proposal.status === "publication_en_cours" || proposal.status === "publication_incertaine" || proposal.status === "executee") {
    throw new PublishRefusedError("Cette publication est déjà en cours ou traitée. Vérifiez votre Page Facebook avant toute nouvelle tentative.", 409);
  }

  const humanApproved = APPROVED.includes(proposal.status) && proposal.approvedVersion === proposal.version;
  if (!canExecuteAction(proposal.kind, "accompagner", humanApproved, { publicExposure: true }, configuredRiskLevel)) {
    throw new PublishRefusedError("Approuvez cette version de la publication avant de la publier.", 400);
  }
  if (expectedVersion !== proposal.version) {
    throw new PublishRefusedError("La version affichée n'est plus la version approuvée. Rechargez la page avant de publier.", 409);
  }

  const connection = await prisma.channelConnection.findUnique({ where: { companyId_channel: { companyId, channel: "facebook" } } });
  if (connection?.status !== "connecte" || !connection.accessToken) {
    throw new PublishRefusedError("Connectez votre Page Facebook avant de publier.", 409);
  }
  let page;
  try {
    const account = decryptFacebookAccount(connection.accessToken, companyId);
    page = account.pages.find((candidate) => candidate.id === account.selectedPageId);
  } catch {
    page = undefined;
  }
  if (!page) throw new PublishRefusedError("La connexion Facebook est à refaire depuis Connexions.", 409);

  // Réservation atomique de la version approuvée : une seule requête peut passer.
  const claimed = await prisma.agentProposal.updateMany({
    where: { id: proposal.id, companyId, version: expectedVersion, approvedVersion: expectedVersion, status: { in: APPROVED } },
    data: { status: "publication_en_cours" },
  });
  if (claimed.count !== 1) {
    throw new PublishRefusedError("Cette publication a changé ou est déjà en cours. Rechargez la page.", 409);
  }

  const outcome = await publishFacebookPagePost(page, proposal.content, fetchImpl);
  const destination = `la Page Facebook « ${page.name} »`;

  // Le journal ne contient ni jeton ni contenu : la destination, la version et l'identifiant public de la publication.
  if (outcome.status === "published") {
    const detail = `Publié sur ${destination} depuis la version ${proposal.version} (publication ${outcome.postId}).`;
    await prisma.agentProposal.update({
      where: { id: proposal.id },
      data: {
        status: "executee",
        executionLog: { upsert: { create: { result: "succes", detail }, update: { result: "succes", detail, executedAt: new Date() } } },
      },
    });
    return { message: `Publication mise en ligne sur ${destination}.` };
  }

  if (outcome.status === "uncertain") {
    const detail = `Résultat incertain sur ${destination} pour la version ${proposal.version} : vérifier la Page avant toute nouvelle tentative.`;
    await prisma.agentProposal.update({
      where: { id: proposal.id },
      data: {
        status: "publication_incertaine",
        executionLog: { upsert: { create: { result: "incertain", detail }, update: { result: "incertain", detail, executedAt: new Date() } } },
      },
    });
    throw new PublishRefusedError("Facebook n'a pas confirmé la publication. Vérifiez votre Page avant toute nouvelle tentative.", 502);
  }

  // Refus explicite : rien n'a été publié, la version reste approuvée et peut être republiée.
  const detail = `Publication refusée par Facebook sur ${destination} pour la version ${proposal.version}.`;
  await prisma.$transaction([
    prisma.agentProposal.update({
      where: { id: proposal.id },
      data: {
        status: proposal.status,
        executionLog: { upsert: { create: { result: "echec", detail }, update: { result: "echec", detail, executedAt: new Date() } } },
      },
    }),
    ...(outcome.tokenRejected
      ? [prisma.channelConnection.update({ where: { id: connection.id }, data: { status: "erreur" } })]
      : []),
  ]);
  throw new PublishRefusedError(outcome.tokenRejected
    ? "Facebook a refusé l'accès à votre Page. Reconnectez-la depuis Connexions, puis réessayez."
    : "Facebook a refusé la publication. Rien n'a été publié ; vous pouvez corriger le texte ou réessayer.", 502);
}
