import { z } from "zod";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, AGENT_MODEL } from "@/lib/anthropic";
import { prisma } from "@/lib/prisma";
import { getRejectionContext } from "@/lib/agents/rejection-context";
import { agentFailureMessage } from "@/lib/agents/agent-errors";
import { PERSONAS, objectiveLine, directionLine, companyProfileLines } from "@/lib/agents/personas";
import { runMarketingAgent } from "@/lib/agents/marketing";
import { runContenuAgent } from "@/lib/agents/contenu";
import { runDemarchageAgent } from "@/lib/agents/demarchage";
import { recordUsage, runToolLoop } from "@/lib/usage";
import { getFunnelStats, funnelLines } from "@/lib/funnel";
import { getChatInstructionsForPlan, getPlanAndFunnelStatus, loadRecentChatHistory } from "@/lib/agents/chat-context";

const PERSONA = PERSONAS.co_ceo;

/**
 * Agent "Partenaire de croissance" (Paul, ex-"Co-CEO" — cf. docs/backlog.md) :
 * point de contact unique, orchestre les autres agents en les invoquant
 * comme des outils. Équipe rationalisée le 2026-10-05 : 4 agents
 * (Marketing/Contenu/Démarchage + lui-même), Nadia fusionnée dans Martine.
 * Garde-fou inchangé : déléguer ne fait que créer des propositions (ou des
 * constats), jamais d'exécution réelle.
 */
export async function runCoCeoTurn(companyId: string, userMessage: string) {
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
  });

  await prisma.chatMessage.create({
    data: { companyId, role: "user", content: userMessage },
  });

  const history = await loadRecentChatHistory(companyId);

  // Le dernier tour est marqué pour le prompt caching : chaque nouveau
  // message relit l'historique mis en cache au tour précédent plutôt que de
  // le refacturer en entier (cf. doc prompt caching — pattern "conversation
  // multi-tours"). Le système ci-dessous est lui-même entièrement stable
  // pour une entreprise donnée (aucune donnée recalculée par appel, Paul
  // passe par get_current_status plutôt que par un état injecté), donc mis
  // en cache en un seul bloc.
  const messages: Anthropic.MessageParam[] = history.map((m, i) => ({
    role: m.role === "user" ? "user" : "assistant",
    content:
      i === history.length - 1
        ? [{ type: "text" as const, text: m.content, cache_control: { type: "ephemeral" as const } }]
        : m.content,
  }));

  const getCurrentStatus = betaZodTool({
    name: "get_current_status",
    description:
      "Récupère l'état réel actuel : plan d'action en cours, suivi des prospects, propositions en attente (avec leur contenu) et derniers constats d'audit. À utiliser systématiquement avant de répondre à toute question sur l'état, le plan, les prospects, le contenu ou le nombre de propositions/constats — ne jamais deviner ni se fier à ce qui a été dit dans un tour précédent.",
    inputSchema: z.object({}),
    run: async () => {
      const [pending, findings] = await Promise.all([
        prisma.agentProposal.findMany({
          where: { companyId, status: "en_attente" },
          orderBy: { createdAt: "desc" },
        }),
        prisma.auditFinding.findMany({
          where: { companyId },
          orderBy: { createdAt: "desc" },
          take: 5,
        }),
      ]);
      return JSON.stringify({
        ...(await getPlanAndFunnelStatus(companyId)),
        refusRecents: await getRejectionContext(companyId),
        propositionsEnAttente: pending.map((p) => ({
          id: p.id,
          agent: p.agent,
          kind: p.kind,
          title: p.title,
          content: p.content,
        })),
        derniersConstatsAudit: findings.map((f) => ({
          title: f.title,
          content: f.content,
        })),
      });
    },
  });

  const delegateMarketing = betaZodTool({
    name: "delegate_marketing",
    description:
      "Lance Martine (Marketing Officer) : audit de présence en ligne, positionnement concurrentiel, et pilotage de la fiche Google (infos, avis). Ne produit pas de contenu créatif.",
    inputSchema: z.object({}),
    run: async () => {
      try {
        const { findings, proposals } = await runMarketingAgent(companyId);
        return `${findings.length} constat(s) et ${proposals.length} proposition(s) créé(s) par ${PERSONAS.marketing.name}, en attente de validation dans le dashboard.`;
      } catch (error) {
        console.error("Erreur délégation marketing:", error);
        return `ÉCHEC, rien n'a été créé : ${agentFailureMessage(error, PERSONAS.marketing.name)}`;
      }
    },
  });

  const delegateContenu = betaZodTool({
    name: "delegate_contenu",
    description:
      "Lance Camille (Contenu & Site) pour proposer des posts réseaux sociaux et/ou du contenu de site web. Si une actualité réelle a été mentionnée par l'utilisateur, passe-la — sinon laisse vide, elle proposera ses propres idées génériques. Ne jamais inventer une actualité.",
    inputSchema: z.object({
      newsContext: z
        .string()
        .optional()
        .describe("Actualité à communiquer, telle que mentionnée par l'utilisateur — omettre si aucune n'a été donnée"),
    }),
    run: async (input) => {
      try {
        const proposals = await runContenuAgent(companyId, input.newsContext);
        return `${proposals.length} proposition(s) créée(s) par ${PERSONAS.contenu.name}, en attente de validation dans le dashboard.`;
      } catch (error) {
        console.error("Erreur délégation contenu:", error);
        return `ÉCHEC, rien n'a été créé : ${agentFailureMessage(error, PERSONAS.contenu.name)}`;
      }
    },
  });

  const delegateDemarchage = betaZodTool({
    name: "delegate_demarchage",
    description:
      "Lance l'agent Démarchage : recherche des pistes de croissance réelles (actualités, événements locaux) et, si un type de prospects a été décrit par l'utilisateur, prépare des templates de prospection générique.",
    inputSchema: z.object({
      prospectDescription: z
        .string()
        .optional()
        .describe("Type de prospects visés, tel que mentionné par l'utilisateur — omettre si non précisé"),
    }),
    run: async (input) => {
      try {
        const proposals = await runDemarchageAgent(companyId, input.prospectDescription);
        return `${proposals.length} proposition(s) créée(s) par ${PERSONAS.demarchage.name}, en attente de validation dans le dashboard.`;
      } catch (error) {
        console.error("Erreur délégation demarchage:", error);
        return `ÉCHEC, rien n'a été créé : ${agentFailureMessage(error, PERSONAS.demarchage.name)}`;
      }
    },
  });

  const { finalMessage, usage } = await runToolLoop(anthropic.beta.messages.toolRunner({
    model: AGENT_MODEL,
    max_tokens: 2000,
    tools: [getCurrentStatus, delegateMarketing, delegateContenu, delegateDemarchage],
    system: [
      {
        type: "text",
        cache_control: { type: "ephemeral" },
        text: `Tu es ${PERSONA.name} de BienDecider, un copilote IA pour indépendants et TPE. ${PERSONA.blurb}
Entreprise : ${company.name} (métier : ${company.trade}), zone de chalandise : ${company.servingArea}.
${companyProfileLines(company)}
${objectiveLine(company)}
${directionLine(company.direction)}

Tu es un partenaire business, pas un simple assistant qui répond aux questions : tu comprends le métier et le marché du dirigeant, tu l'aides à fixer un objectif chiffré, tu décides avec lui des priorités, tu délègues aux agents spécialisés, tu t'appuies sur les résultats mesurés (écart vers l'objectif, funnel de prospection) pour ajuster ce qui vient ensuite — pas sur des recommandations génériques déconnectées de ce qui se passe réellement.
Ton rôle concret : échanger avec le dirigeant, l'aider à prioriser, et déléguer aux agents spécialisés (${PERSONAS.marketing.name} pour l'audit/positionnement/fiche Google, ${PERSONAS.contenu.name} pour les posts et le site web, ${PERSONAS.demarchage.name} pour le démarchage et les pistes de croissance) via les outils delegate_* quand c'est pertinent.
Règles strictes, non négociables :
- RÈGLE ABSOLUE : ne dis JAMAIS qu'une action a été faite (proposition créée, audit relancé, fiche vue, contenu consulté) sans avoir réellement appelé l'outil correspondant DANS CE TOUR. Tu n'as aucune mémoire fiable de ce qui a été fait avant ce message — si on te demande l'état actuel, le plan d'action, le suivi des prospects, le nombre ou le contenu de propositions/constats, appelle TOUJOURS get_current_status avant de répondre. Ne devine jamais.
- Avant de proposer une priorité ou de déléguer, appelle get_current_status pour partir du plan en cours et du suivi des prospects : ne propose pas ce qui est déjà au plan, et appuie-toi sur ce que le dirigeant t'a déjà dit dans cette conversation plutôt que de le lui redemander.
- Si un outil delegate_* répond « ÉCHEC », dis clairement au dirigeant que l'agent n'a rien produit et qu'il peut relancer : ne présente jamais un échec comme un travail fait.
- Tu ne fais JAMAIS exécuter une action réelle toi-même, même automatiquement : déléguer ne fait que créer des propositions, qui restent soumises à la validation du dirigeant dans le dashboard. Dis-le clairement si tu délègues.
- Tu ne construis pas de site web toi-même (${PERSONAS.contenu.name} ne fournit qu'un brief de contenu, pas le site), ni ne publies ou modifies quoi que ce soit toi-même sur les plateformes externes — sois honnête sur ce que tu ne sais pas faire plutôt que de promettre.
- Si on te demande de connecter un compte (Google, Instagram, Facebook) : explique que ça se fait via OAuth sur la page /connexions, et que tu ne dois JAMAIS demander ou recevoir un mot de passe dans cette conversation.
- Pour déléguer à Contenu (sans actualité) ou Démarchage (sans cible), tu peux le faire sans information — les agents proposeront leurs propres idées génériques. Avec une info concrète donnée par le dirigeant, transmets-la pour des propositions plus ciblées.
- Pour les pistes de prospection, seules des informations publiques et professionnelles sont acceptables — refuse poliment toute demande de cibler des particuliers avec leurs données personnelles.
- Réponds de façon brève et directe, comme un vrai point rapide entre dirigeants, pas un rapport formel.`,
      },
    ],
    messages,
  }));

  const assistantText = finalMessage.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  const savedReply = assistantText || "(pas de réponse textuelle — vérifiez le dashboard pour les nouvelles propositions)";

  await recordUsage({
    companyId: company.id,
    agent: "co_ceo",
    model: AGENT_MODEL,
    usage,
  });

  await prisma.chatMessage.create({
    data: { companyId, role: "assistant", content: savedReply },
  });

  return savedReply;
}

/**
 * Paul "meneur" : produit un plan d'action structuré (quoi, qui, quand,
 * pourquoi) plutôt que de la prose — demande CEO explicite ("force de
 * proposition", "donne la direction"). Séparé de runCoCeoTurn : ne touche
 * pas à l'historique de chat, ne délègue jamais lui-même (chaque item du
 * plan n'est lancé que si l'utilisateur clique "Lancer" dans le dashboard).
 */
export async function runCoCeoPlanning(companyId: string) {
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
  });

  const [pendingProposals, recentFindings, existingPlan, discarded, funnel] = await Promise.all([
    prisma.agentProposal.findMany({
      where: { companyId, status: "en_attente" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.auditFinding.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    prisma.actionPlanItem.findMany({
      where: { companyId, status: { in: ["propose", "lance"] } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.actionPlanItem.findMany({
      where: { companyId, status: "ecarte" },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    getFunnelStats(companyId),
  ]);

  const createdItemIds: string[] = [];

  const proposePlanItem = betaZodTool({
    name: "propose_plan_item",
    description: "Ajoute une action au plan priorisé. Appelle cet outil une fois par action recommandée (3 à 5 fois en général).",
    inputSchema: z.object({
      agent: z
        .enum(["marketing", "contenu", "demarchage"])
        .describe("Agent responsable de cette action"),
      title: z.string().describe("Action concrète et courte, ex: 'Mettre à jour la fiche Google'"),
      rationale: z
        .string()
        .describe("Pourquoi cette action, en lien avec l'objectif business du dirigeant"),
      timing: z.string().describe("Quand, en langage naturel : 'aujourd'hui', 'cette semaine', 'dès que le site est en ligne'"),
    }),
    run: async (input) => {
      const item = await prisma.actionPlanItem.create({
        data: {
          companyId,
          agent: input.agent,
          title: input.title,
          rationale: input.rationale,
          timing: input.timing,
        },
      });
      createdItemIds.push(item.id);
      return `Action ajoutée au plan (id: ${item.id}).`;
    },
  });

  // Bloc stable (persona, identité entreprise, consignes de génération du
  // plan) mis en cache ; l'état réel (propositions en attente, constats,
  // plan existant, actions écartées) est recalculé à chaque appel et reste
  // donc hors cache, en toute fin de system (cf. doc prompt caching).
  const stableSystem = `Tu es ${PERSONA.name} de BienDecider. Tu dois être force de proposition et donner une direction claire — pas attendre des questions.
Entreprise : ${company.name} (métier : ${company.trade}), zone de chalandise : ${company.servingArea}. Site web : ${company.website ?? (company.siteSlug ? `publié par BienDecider (/site/${company.siteSlug})` : "aucun")}.
${companyProfileLines(company)}
${objectiveLine(company)}
${directionLine(company.direction)}

Ta tâche : propose un plan priorisé de 3 à 5 actions concrètes via propose_plan_item, chacune rattachée à un agent (${PERSONAS.marketing.name}/marketing pour audit-positionnement-fiche Google, ${PERSONAS.contenu.name}/contenu pour posts et site web, ${PERSONAS.demarchage.name}/demarchage pour la prospection), avec une justification liée à l'objectif et un délai réaliste.
Règles :
- Chaque action doit faire avancer l'objectif de façon mesurable — dis dans la justification QUEL effet attendu (appels, devis, avis, visibilité).
- Une action = un brief exécutable par l'agent tel quel : précis sur le quoi (ex: "3 posts sur les chantiers terminés avec photos avant/après"), pas vague ("améliorer la com").
- Si l'entreprise n'a pas de site, l'action "préparer le contenu du site" (contenu) est prioritaire : BienDecider le publie après validation.
- Base-toi sur l'état réel ci-dessous — ne répète pas une action déjà proposée, au plan ou écartée.
- Tiens compte de ce que le dirigeant a dit dans le chat (préférences, refus, priorités) : une action contraire à une consigne récente ne doit pas figurer au plan.
- Priorise ce qui a le plus d'impact pour l'objectif, pas une liste exhaustive.`;

  const dynamicSystem = `${await getRejectionContext(companyId)}
${await getChatInstructionsForPlan(companyId)}
Propositions déjà en attente de validation : ${pendingProposals.map((p) => `${p.agent}: ${p.title}`).join("; ") || "aucune"}.
Derniers constats (audit, concurrence) : ${recentFindings.map((f) => f.title).join("; ") || "aucun"}.
Actions déjà au plan (ne les répète pas) : ${existingPlan.map((i) => i.title).join("; ") || "aucune"}.
Actions ÉCARTÉES par le dirigeant, avec sa raison — ne les repropose pas et tiens compte de la raison : ${discarded.map((i) => `"${i.title}" (${i.feedback || "sans raison"})`).join("; ") || "aucune"}.
${funnelLines(funnel)}`;

  const { usage } = await runToolLoop(anthropic.beta.messages.toolRunner({
    model: AGENT_MODEL,
    max_tokens: 2000,
    tools: [proposePlanItem],
    system: [
      { type: "text", text: stableSystem, cache_control: { type: "ephemeral" } },
      { type: "text", text: dynamicSystem },
    ],
    messages: [
      {
        role: "user",
        content: "Donne-moi ton plan d'action priorisé.",
      },
    ],
  }));

  await recordUsage({
    companyId: company.id,
    agent: "co_ceo",
    model: AGENT_MODEL,
    usage,
  });

  return prisma.actionPlanItem.findMany({
    where: { id: { in: createdItemIds } },
  });
}
