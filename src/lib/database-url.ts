export function getDatabaseUrl(): string {
  const databaseUrl =
    process.env.DATABASE_URL ??
    process.env.DATABASE_PRISMA_DATABASE_URL ??
    process.env.DATABASE_POSTGRES_URL;

  if (!databaseUrl) {
    throw new Error(
      "Database URL is missing. Set DATABASE_URL, DATABASE_PRISMA_DATABASE_URL, or DATABASE_POSTGRES_URL.",
    );
  }

  try {
    const url = new URL(databaseUrl);
    const sslMode = url.searchParams.get("sslmode")?.toLowerCase();
    const usesLibpqCompatibility = url.searchParams.get("uselibpqcompat")?.toLowerCase() === "true";
    if (!usesLibpqCompatibility && ["prefer", "require", "verify-ca"].includes(sslMode ?? "")) {
      url.searchParams.set("sslmode", "verify-full");
    }
    return url.toString();
  } catch {
    return databaseUrl;
  }
}