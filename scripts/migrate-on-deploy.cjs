// Applique les migrations versionnées avant le build Vercel de production.
// Inactif tant que MIGRATE_ON_DEPLOY=1 n'est pas défini dans Vercel : la base
// du prototype a été créée avec `prisma db push` et doit d'abord être alignée
// une fois à la main (procédure : docs/ci-cd.md, « Base et configuration »).
const { execFileSync } = require("node:child_process");

if (process.env.VERCEL_ENV !== "production" || process.env.MIGRATE_ON_DEPLOY !== "1") {
  console.log("Migrations ignorées (hors production Vercel ou MIGRATE_ON_DEPLOY différent de 1).");
  process.exit(0);
}

// Un échec arrête le build : la version précédente reste servie.
execFileSync("npx", ["prisma", "migrate", "deploy"], { stdio: "inherit", shell: process.platform === "win32" });
