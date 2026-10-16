/** Corps JSON d'une requête s'il s'agit d'un objet ; null sinon (JSON invalide, null, tableau, scalaire). */
export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  const body: unknown = await request.json().catch(() => null);
  return body !== null && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}
