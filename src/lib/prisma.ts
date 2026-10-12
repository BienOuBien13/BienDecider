import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDatabaseUrl } from "@/lib/database-url";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// PostgreSQL en dev comme en prod (cf. docs/architecture-technique.md) —
// DATABASE_URL pointe vers Vercel Postgres en prod, vers une base locale/
// distante au choix en dev.
const adapter = new PrismaPg({ connectionString: getDatabaseUrl() });

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
