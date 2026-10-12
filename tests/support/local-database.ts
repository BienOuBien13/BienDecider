import { config } from "dotenv";

config({ quiet: true });

/**
 * À appeler avant tout test qui écrit en base : refus par défaut de toute
 * base non locale, pour ne jamais viser celle du prototype par erreur.
 */
export function requireLocalDatabase(suite: string) {
  if (!process.env.DATABASE_URL) throw new Error(`DATABASE_URL is required for ${suite}.`);
  const databaseHost = new URL(process.env.DATABASE_URL).hostname;
  if (!["localhost", "127.0.0.1", "[::1]"].includes(databaseHost) && process.env.UX_TEST_ALLOW_REMOTE_DB !== "1") {
    throw new Error(`${suite} refuse a non-local DATABASE_URL. Set UX_TEST_ALLOW_REMOTE_DB=1 only for a dedicated development database, never the prototype one.`);
  }
}
