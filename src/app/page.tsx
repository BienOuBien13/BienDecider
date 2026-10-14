import { Suspense, cache } from "react";
import Link from "next/link";
import { PERSONAS, type AgentKey } from "@/lib/agents/personas";
import { PersonaAvatar } from "@/components/persona-avatar";
import { getSessionEmail } from "@/lib/session";

const TEAM: AgentKey[] = ["co_ceo", "marketing", "contenu", "demarchage"];

// Exemple de démonstration : données inventées, aucune entreprise cliente (#86, #88).
const EXAMPLE_PLAN = [
  { title: "Créer un site d'une page", detail: "Zone d'intervention, dépannage urgent et numéro direct." },
  { title: "Publier deux posts par semaine", detail: "Chantiers récents et conseils d'entretien sur la Page Facebook." },
  { title: "Contacter 15 syndics du secteur", detail: "Liste de prospects et message de présentation préparés." },
];

// Promesse par livrable : les agents préparent, et n'agissent au nom du dirigeant que sur sa décision.
const CAPABILITIES = [
  {
    deliverable: "Diagnostic et plan d'action",
    us: "Analyse votre présence en ligne et vos concurrents, puis propose 3 à 5 actions.",
    you: "Vous choisissez les actions à lancer.",
  },
  {
    deliverable: "Site vitrine",
    us: "Rédige votre site et le publie à votre nom.",
    you: "Vous le relisez et décidez de sa mise en ligne.",
  },
  {
    deliverable: "Publications sur les réseaux",
    us: "Rédige vos posts Facebook, Instagram, LinkedIn et Google, puis les publie pour vous.",
    you: "Vous relisez et décidez de ce qui part.",
  },
  {
    deliverable: "Prospection",
    us: "Repère des prospects, prépare le message d'approche et l'envoie pour vous.",
    you: "Vous validez chaque envoi.",
  },
];

const STEPS = [
  { n: "1", title: "Vous donnez l'objectif", text: "« 10 demandes de devis par mois ». Votre métier, votre zone, votre site s'il existe. Environ 5 minutes." },
  { n: "2", title: "Paul fait le plan", text: "Votre partenaire de croissance analyse votre situation et propose quelques actions, confiées à son équipe." },
  { n: "3", title: "L'équipe prépare", text: "Site, posts, prospection : chaque agent prépare le travail concret." },
  { n: "4", title: "Vous relisez et décidez", text: "Rien ne part sans votre accord. Une fois votre décision prise, BienDecider publie ou envoie pour vous." },
];

// Une seule vérification par requête, partagée par l'en-tête et le bloc principal.
const isSignedIn = cache(async (): Promise<boolean> => {
  try {
    return (await getSessionEmail()) !== null;
  } catch {
    // L'accueil reste disponible même si la session ne peut pas être vérifiée.
    return false;
  }
});

const SECONDARY_LINK = "rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200";
const PRIMARY_BUTTON =
  "inline-flex min-h-11 items-center rounded-lg bg-indigo-600 px-6 text-base font-medium text-white hover:bg-indigo-700";

function SignedOutActions() {
  return (
    <>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Link href="/signup" className={PRIMARY_BUTTON}>
          Créer mon compte
        </Link>
        <Link
          href="/login"
          className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-6 text-base font-medium text-slate-800 hover:bg-slate-100"
        >
          J&apos;ai déjà un compte
        </Link>
      </div>
      <p className="mt-3 text-sm text-slate-600">
        Première étape : votre objectif, votre métier et votre zone. Votre plan vous est proposé ensuite.
      </p>
    </>
  );
}

// Seuls ces deux blocs dépendent de la session : le reste de l'accueil s'affiche sans attendre.
async function HeaderAction() {
  return (await isSignedIn()) ? (
    <Link href="/dashboard" className={SECONDARY_LINK}>Mon espace</Link>
  ) : (
    <Link href="/login" className={SECONDARY_LINK}>Se connecter</Link>
  );
}

async function HeroActions() {
  if (!(await isSignedIn())) return <SignedOutActions />;
  return (
    <div className="mt-8">
      <Link href="/dashboard" className={PRIMARY_BUTTON}>
        Accéder à mon espace
      </Link>
    </div>
  );
}

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-16">
        <header className="flex items-center justify-between gap-4">
          <p className="text-lg font-semibold text-indigo-700">BienDecider</p>
          <Suspense fallback={<Link href="/login" className={SECONDARY_LINK}>Se connecter</Link>}>
            <HeaderAction />
          </Suspense>
        </header>

        <section className="mt-12" aria-labelledby="promesse">
          <h1 id="promesse" className="text-3xl font-semibold leading-tight sm:text-4xl">
            Vous fixez l&apos;objectif, BienDecider prépare le travail pour l&apos;atteindre.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-slate-600">
            Pour les indépendants et les TPE qui n&apos;ont pas le temps de s&apos;occuper de leur croissance :
            diagnostic, plan d&apos;action, site, publications et prospection sont préparés pour vous. Vous gardez
            le dernier mot.
          </p>
          <Suspense fallback={<SignedOutActions />}>
            <HeroActions />
          </Suspense>
        </section>

        <section className="mt-14 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="exemple">
          <p className="inline-block rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-900">
            Exemple fictif, aucune donnée client
          </p>
          <h2 id="exemple" className="mt-3 text-xl font-semibold">Un plombier qui veut plus de demandes de devis</h2>
          <p className="mt-1 text-base text-slate-600">
            Objectif : <strong className="font-medium text-slate-900">10 demandes de devis par mois</strong>.
          </p>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Le plan proposé par Paul</h3>
              <ol className="mt-3 space-y-3">
                {EXAMPLE_PLAN.map((step, i) => (
                  <li key={step.title} className="flex gap-3">
                    <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">
                      {i + 1}
                    </span>
                    <span>
                      <span className="block font-medium">{step.title}</span>
                      <span className="block text-sm text-slate-600">{step.detail}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Une production à relire</h3>
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-medium text-slate-600">Post Facebook · préparé par Camille</p>
                <p className="mt-2 text-base">
                  Fuite sous l&apos;évier un dimanche ? Nous intervenons sur toute l&apos;agglomération, 7 jours sur 7.
                  Devis gratuit avant chaque intervention.
                </p>
                <p className="mt-3 text-sm font-medium text-slate-900">À vérifier avant de publier :</p>
                <ul className="mt-1 list-disc pl-5 text-sm text-slate-700">
                  <li>la disponibilité 7 jours sur 7</li>
                  <li>la gratuité du devis</li>
                </ul>
                <p className="mt-3 text-sm text-slate-600">
                  Vous modifiez si besoin, puis vous approuvez cette version : Camille la publie alors sur votre Page.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-14" aria-labelledby="qui-fait-quoi">
          <h2 id="qui-fait-quoi" className="text-xl font-semibold">Ce que BienDecider fait pour vous</h2>
          <p className="mt-1 text-base text-slate-600">
            Les agents préparent tout le travail. Ils n&apos;agissent en votre nom que sur votre décision.
          </p>
          <ul className="mt-5 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white shadow-sm">
            {CAPABILITIES.map((c) => (
              <li key={c.deliverable} className="grid gap-2 p-4 sm:grid-cols-[1fr_1.4fr_1.4fr] sm:gap-4">
                <h3 className="font-medium">{c.deliverable}</h3>
                <p className="text-sm text-slate-700">
                  <span className="font-medium text-indigo-700">BienDecider : </span>
                  {c.us}
                </p>
                <p className="text-sm text-slate-700">
                  <span className="font-medium text-slate-900">Vous : </span>
                  {c.you}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-14" aria-labelledby="etapes">
          <h2 id="etapes" className="text-xl font-semibold">Comment ça marche</h2>
          <ol className="mt-5 grid gap-4 sm:grid-cols-2">
            {STEPS.map((s) => (
              <li key={s.n} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <span className="text-sm font-semibold text-indigo-700">Étape {s.n}</span>
                <h3 className="mt-1 font-medium">{s.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-14 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="equipe">
          <h2 id="equipe" className="text-xl font-semibold">L&apos;équipe qui prépare le travail</h2>
          <ul className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {TEAM.map((key) => (
              <li key={key} className="flex flex-col items-center text-center">
                <PersonaAvatar agentKey={key} size={48} />
                <span className="mt-2 text-sm font-medium">{PERSONAS[key].name}</span>
                <span className="text-sm text-slate-600">{PERSONAS[key].role}</span>
              </li>
            ))}
          </ul>
        </section>

        <p className="mt-12 text-sm text-slate-600">
          Aucune action n&apos;est exécutée sans votre validation. Vos accès Google et Meta passent par leurs connexions
          officielles : vous ne saisissez jamais leur mot de passe chez nous.{" "}
          <Link href="/confidentialite" className="font-medium text-slate-800 underline">
            Comment vos données sont traitées
          </Link>
        </p>

        <footer className="mt-8 flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-200 pt-4 text-sm text-slate-600">
          <Link href="/cgu" className="py-1 hover:underline">Conditions d&apos;utilisation</Link>
          <Link href="/confidentialite" className="py-1 hover:underline">Confidentialité</Link>
          <Link href="/mentions-legales" className="py-1 hover:underline">Mentions légales</Link>
          <a href="mailto:contact@biendecider.com" className="py-1 hover:underline">Contact</a>
        </footer>
      </div>
    </main>
  );
}
