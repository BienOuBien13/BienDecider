import assert from "node:assert/strict";
import test from "node:test";
import { getDatabaseUrl } from "../src/lib/database-url.ts";

test("database URL prefers the canonical name then Prisma aliases", () => {
  const keys = ["DATABASE_URL", "DATABASE_PRISMA_DATABASE_URL", "DATABASE_POSTGRES_URL"];
  const originalValues = new Map(keys.map((key) => [key, process.env[key]]));

  try {
    for (const key of keys) delete process.env[key];
    process.env.DATABASE_POSTGRES_URL = "postgres-fallback";
    process.env.DATABASE_PRISMA_DATABASE_URL = "prisma-fallback";
    process.env.DATABASE_URL = "canonical";
    assert.equal(getDatabaseUrl(), "canonical");

    delete process.env.DATABASE_URL;
    assert.equal(getDatabaseUrl(), "prisma-fallback");

    delete process.env.DATABASE_PRISMA_DATABASE_URL;
    assert.equal(getDatabaseUrl(), "postgres-fallback");

    delete process.env.DATABASE_POSTGRES_URL;
    assert.throws(getDatabaseUrl, /Database URL is missing/);
  } finally {
    for (const [key, value] of originalValues) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});