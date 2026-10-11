import type { Company } from "@prisma/client";

export type SafeCompany = Omit<Company, "passwordHash">;

/**
 * Retire passwordHash avant toute sortie vers le client — à appeler sur
 * tout Company renvoyé par une API route ou passé en props à un composant
 * client (où il finit dans le payload RSC envoyé au navigateur). Fuite
 * réelle trouvée le 2026-10-05 : /api/companies et les pages dashboard/
 * équipe renvoyaient l'objet complet, hash inclus.
 */
export function omitPasswordHash<T extends { passwordHash?: string | null }>(
  company: T,
): Omit<T, "passwordHash"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash: _passwordHash, ...rest } = company;
  return rest;
}
