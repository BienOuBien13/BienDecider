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

test("database URL upgrades legacy SSL aliases to verify-full", () => {
  const original = process.env.DATABASE_URL;
  try {
    for (const mode of ["prefer", "require", "verify-ca"]) {
      process.env.DATABASE_URL = `postgresql://user:encoded%40password@db.example.invalid:5432/app?sslmode=${mode}&application_name=biendecider`;
      const url = new URL(getDatabaseUrl());
      assert.equal(url.searchParams.get("sslmode"), "verify-full");
      assert.equal(url.searchParams.get("application_name"), "biendecider");
      assert.equal(url.username, "user");
      assert.equal(url.password, "encoded%40password");
    }
    process.env.DATABASE_URL = "postgresql://db.example.invalid/app?sslmode=verify-full";
    assert.equal(new URL(getDatabaseUrl()).searchParams.get("sslmode"), "verify-full");
    process.env.DATABASE_URL = "postgresql://db.example.invalid/app?uselibpqcompat=true&sslmode=require";
    assert.equal(new URL(getDatabaseUrl()).searchParams.get("sslmode"), "require");
  } finally {
    if (original === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original;
  }
});