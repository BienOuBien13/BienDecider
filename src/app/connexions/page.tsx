import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionEmail } from "@/lib/session";
import { AppShell } from "@/components/app-shell";
import { isGoogleOAuthConfigured } from "@/lib/oauth/google";
import { isMetaOAuthConfigured } from "@/lib/oauth/meta";
import { decryptGmailAccount, isGmailConfigured } from "@/lib/oauth/gmail";
import { GmailPanel } from "./gmail-panel";
import { LinkedInPanel } from "./linkedin-panel";
import { decryptLinkedInAccount, isLinkedInConfigured, LINKEDIN_ERROR_MESSAGES } from "@/lib/oauth/linkedin";

export const dynamic = "force-dynamic";

const CHANNELS = [
  {
    channel: "google_business_profile",
    label: "Fiche Google Business Profile",
    startUrl: "/api/oauth/google/start",
    configured: isGoogleOAuthConfigured(),
    missingEnvHint: "GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET",
    registrationStep:
      "Obtenir l'accès Business Profile API pour le projet Google, puis configurer le client OAuth web.",
  },
  {
    channel: "facebook",
    label: "Facebook",
    startUrl: "/api/oauth/meta/start",
    configured: isMetaOAuthConfigured(),
    missingEnvHint: "META_APP_ID / META_APP_SECRET",
    registrationStep:
      "Créer une app sur developers.facebook.com, ajouter le produit Facebook Login, et demander les permissions pages_manage_posts (App Review Meta requis).",
  },
  {
    channel: "instagram",
    label: "Instagram",
    startUrl: "/api/oauth/meta/start",
    configured: isMetaOAuthConfigured(),
    missingEnvHint: "META_APP_ID / META_APP_SECRET",
    registrationStep:
      "Même app Meta que Facebook, avec les permissions Instagram du flux Facebook Login vérifiées (App Review Meta requis) et un compte Instagram pro lié à la Page.",
  },
] as const;

async function getConnectionSnapshot(companyId: string) {
  const connections = await prisma.channelConnection.findMany({ where: { companyId } });
  let gmailEmail: string | null = null;
  const gmail = connections.find((connection) => connection.channel === "gmail");
  try {
    if (gmail?.refreshToken) gmailEmail = decryptGmailAccount(gmail.refreshToken, companyId).email;
  } catch {
    gmailEmail = null;
  }
  return { connections, checkedAt: Date.now(), gmailEmail };
}

export default async function ConnexionsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const ownerEmail = await getSessionEmail();
  if (!ownerEmail) redirect("/login");

  const company = await prisma.company.findUnique({ where: { ownerEmail } });
  if (!company || !company.name) redirect("/onboarding");

  const { connected, error } = await searchParams;

  const { connections: existing, checkedAt, gmailEmail } = await getConnectionSnapshot(company.id);
  const byChannel = new Map(existing.map((c) => [c.channel, c]));
  const linkedin = byChannel.get("linkedin");
  let linkedinName: string | null = null;
  let linkedinStatus: "authorized" | "expired" | "error" | "disconnected" = "disconnected";
  if (linkedin) {
    try {
      if (linkedin.status !== "connecte" || !linkedin.accessToken || !linkedin.expiresAt) throw new Error("Autorisation incomplète.");
      linkedinName = decryptLinkedInAccount(linkedin.accessToken, company.id).name;
      linkedinStatus = linkedin.expiresAt.getTime() <= checkedAt ? "expired" : "authorized";
    } catch {
      linkedinStatus = "error";
    }
  }
  const linkedInErrors: Record<string, string> = {
    ...LINKEDIN_ERROR_MESSAGES,
    linkedin_config: "LinkedIn n'est pas encore configuré sur ce déploiement.",
    linkedin_start: "Impossible de démarrer la connexion LinkedIn. Réessayez.",
    linkedin_state: "Cette demande LinkedIn a expiré ou n'est pas valide. Recommencez depuis Connexions.",
    linkedin_denied: "L'autorisation LinkedIn a été annulée. Votre connexion précédente, si elle existe, est conservée.",
    linkedin_exchange: "Impossible de vérifier l'identité et les permissions LinkedIn. Recommencez l'autorisation.",
  };

  return (
    <AppShell companyName={company.name}>
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold">Connexions</h1>
        <p className="mt-2 text-sm text-gray-600">
          Autorisez BienDecider à accéder à vos comptes via <strong>OAuth</strong>{" "}
          depuis l&apos;écran officiel de Google, Meta ou LinkedIn — vous ne saisissez
          jamais votre mot de passe ici, et vous pouvez révoquer l&apos;accès
          à tout moment depuis votre compte fournisseur.
        </p>
        <p className="mt-3 text-sm text-amber-800">
          Intégration en préparation : l&apos;autorisation OAuth ne confirme pas encore
          l&apos;accès à une fiche Google, une Page Facebook ou un compte Instagram.
          La publication sur ces plateformes n&apos;est pas disponible.
        </p>

        {connected && (
          <p role="status" className="mt-4 rounded bg-green-50 p-3 text-sm text-green-700">
            {connected === "gmail" ? "Gmail autorisé pour l'envoi manuel." : connected === "linkedin" ? "Profil LinkedIn autorisé. Aucune publication n'a été effectuée." : "Autorisation OAuth enregistrée. Le compte professionnel reste à vérifier."}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">
            {linkedInErrors[error] ?? "La connexion a échoué. Réessayez ou contactez le support."}
          </p>
        )}

        <GmailPanel
          configured={isGmailConfigured()}
          authorized={byChannel.get("gmail")?.status === "connecte" && gmailEmail !== null}
          failed={byChannel.get("gmail")?.status === "erreur" || (byChannel.has("gmail") && !gmailEmail)}
          senderEmail={gmailEmail}
        />

        <LinkedInPanel
          configured={isLinkedInConfigured()}
          status={linkedinStatus}
          name={linkedinName}
          expiresAt={linkedin?.expiresAt?.toLocaleString("fr-FR", { timeZone: "Europe/Paris" }) ?? null}
          hasConnection={Boolean(linkedin)}
        />
        <ul className="mt-6 space-y-3">
          {CHANNELS.map((c) => {
            const connection = byChannel.get(c.channel);
            const expired = connection?.expiresAt ? connection.expiresAt.getTime() <= checkedAt : false;
            const connected = connection?.status === "connecte";
            const statusLabel = connection?.status === "erreur"
              ? "Erreur d'autorisation"
              : connected && expired
                ? "Autorisation expirée"
                : connected
                  ? "Autorisation enregistrée · compte à vérifier"
                  : "Non autorisé";
            return (
              <li
                key={c.channel}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 p-4"
              >
                <div className="min-w-0 flex-1 basis-64">
                  <p className="font-medium">{c.label}</p>
                  <p className="text-xs text-gray-500">
                    {statusLabel}
                  </p>
                  {connection?.expiresAt && <p className="mt-1 text-xs text-gray-500">Expiration du jeton : {connection.expiresAt.toLocaleString("fr-FR", { timeZone: "Europe/Paris" })} (heure de Paris)</p>}
                  {!c.configured && (
                    <p className="mt-1 text-xs text-amber-600">
                      Pas encore activable : variables d&apos;environnement{" "}
                      <code>{c.missingEnvHint}</code> manquantes. Étape requise :{" "}
                      {c.registrationStep}
                    </p>
                  )}
                </div>
                {c.configured ? (
                  <a
                    href={c.startUrl}
                    className="shrink-0 rounded bg-black px-3 py-1.5 text-sm text-white"
                  >
                      {connection ? "Réautoriser" : "Autoriser"}
                  </a>
                ) : (
                  <button
                    disabled
                    className="shrink-0 cursor-not-allowed rounded bg-gray-200 px-3 py-1.5 text-sm text-gray-500"
                  >
                    Indisponible
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        <p className="mt-6 text-xs text-gray-400">
          Les agents préparent leurs propositions sans accès direct à vos comptes.
          Après validation, vous publiez vous-même sur Google, Facebook ou Instagram.
        </p>
      </div>
    </AppShell>
  );
}
