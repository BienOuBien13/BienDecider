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

  return databaseUrl;
}