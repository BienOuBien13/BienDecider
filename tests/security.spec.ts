import { test, expect, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { config } from "dotenv";
import { createSessionToken, SESSION_MAX_AGE_SECONDS } from "../src/lib/session-token";
import { hashPassword } from "../src/lib/password";

config({ quiet: true });

const baseURL = process.env.UX_TEST_BASE_URL ?? "http://localhost:3000";

type Guarded = { method: "GET" | "POST" | "PATCH" | "DELETE"; path: string; denied: 401 | 403 | "login" };

// Toute route API doit figurer ici ou dans PUBLIC_ROUTES : le premier test échoue sinon.
// `denied` = réponse attendue sans session valide. `[id]` est remplacé par un identifiant quelconque.
const GUARDED_ROUTES: Guarded[] = [
  { method: "POST", path: "/api/action-plan", denied: 401 },
  { method: "PATCH", path: "/api/action-plan/[id]", denied: 401 },
  { method: "POST", path: "/api/action-plan/[id]/launch", denied: 401 },
  { method: "POST", path: "/api/auth/password", denied: 401 },
  { method: "DELETE", path: "/api/admin/companies/[id]", denied: 403 },
  { method: "GET", path: "/api/admin/delegation-risk", denied: 403 },
  { method: "PATCH", path: "/api/admin/delegation-risk", denied: 403 },
  { method: "POST", path: "/api/agents/contenu/run", denied: 401 },
  { method: "POST", path: "/api/agents/demarchage/run", denied: 401 },
  { method: "POST", path: "/api/agents/marketing/run", denied: 401 },
  { method: "GET", path: "/api/audit-findings", denied: 401 },
  { method: "POST", path: "/api/co-ceo/message", denied: 401 },
  { method: "GET", path: "/api/co-ceo/messages", denied: 401 },
  { method: "GET", path: "/api/co-ceo/plan", denied: 401 },
  { method: "POST", path: "/api/co-ceo/plan", denied: 401 },
  { method: "GET", path: "/api/companies", denied: 401 },
  { method: "POST", path: "/api/companies", denied: 401 },
  { method: "PATCH", path: "/api/companies", denied: 401 },
  { method: "POST", path: "/api/companies/direction", denied: 401 },
  { method: "POST", path: "/api/companies/outreach", denied: 401 },
  { method: "POST", path: "/api/facebook/disconnect", denied: 401 },
  { method: "POST", path: "/api/facebook/page", denied: 401 },
  { method: "POST", path: "/api/gmail/disconnect", denied: 401 },
  { method: "POST", path: "/api/gmail/send", denied: 401 },
  { method: "POST", path: "/api/linkedin/disconnect", denied: 401 },
  { method: "PATCH", path: "/api/leads/[id]", denied: 401 },
  { method: "GET", path: "/api/oauth/gmail/callback", denied: "login" },
  { method: "GET", path: "/api/oauth/gmail/start", denied: "login" },
  { method: "GET", path: "/api/oauth/linkedin/start", denied: "login" },
  { method: "GET", path: "/api/oauth/linkedin/callback", denied: "login" },
  { method: "GET", path: "/api/oauth/google/callback", denied: "login" },
  { method: "GET", path: "/api/oauth/google/start", denied: "login" },
  { method: "GET", path: "/api/oauth/meta/callback", denied: "login" },
  { method: "GET", path: "/api/oauth/meta/start", denied: "login" },
  { method: "GET", path: "/api/proposals", denied: 401 },
  { method: "PATCH", path: "/api/proposals/[id]", denied: 401 },
  { method: "POST", path: "/api/proposals/[id]/execute", denied: 401 },
  { method: "POST", path: "/api/onboarding/interpret", denied: 401 },
];

// Routes volontairement accessibles sans session, avec la raison.
const PUBLIC_ROUTES: Record<string, string> = {
  "/api/auth/login": "point d'entrée de la connexion",
  "/api/auth/logout": "revoque les sessions et efface le cookie de l'appelant (POST même origine)",
  "/api/auth/signup": "inscription publique avec création explicite de compte",
  "/api/cron/weekly-review": "protégée par CRON_SECRET, pas par la session",
  "/api/health": "sonde publique sans donnée métier",
};

const GUARDED_PAGES = ["/admin", "/admin/risques", "/connexions", "/dashboard", "/diagnostic", "/equipe", "/entreprise", "/prospection", "/rapport"];

function requireSecret(): string {
  if (!process.env.SESSION_SECRET) throw new Error("SESSION_SECRET is required for security tests.");
  return process.env.SESSION_SECRET;
}

function sessionCookie(email: string, sessionVersion = 0, now = Date.now(), secret = requireSecret()): string {
  return `pepito_session=${createSessionToken(email, sessionVersion, secret, now)}`;
}

function sessionSignature(cookie: string): string {
  return cookie.slice(cookie.indexOf("=") + 1).split(".")[1];
}

function openDatabase(): PrismaClient {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for security tests.");
  // Ces tests écrivent en base : refus par défaut de toute base non locale, pour ne jamais viser celle du prototype par erreur.
  const databaseHost = new URL(process.env.DATABASE_URL).hostname;
  if (!["localhost", "127.0.0.1", "[::1]"].includes(databaseHost) && process.env.UX_TEST_ALLOW_REMOTE_DB !== "1") {
    throw new Error("Security tests refuse a non-local DATABASE_URL. Set UX_TEST_ALLOW_REMOTE_DB=1 only for a dedicated development database, never the prototype one.");
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
}

function call(request: APIRequestContext, route: Pick<Guarded, "method" | "path">, cookie?: string, data: unknown = {}) {
  return request.fetch(`${baseURL}${route.path.replace("[id]", "identifiant-inexistant")}`, {
    method: route.method,
    // Origin légitime : le refus attendu doit venir de la session, pas du contrôle d'origine.
    headers: { Origin: baseURL, ...(cookie ? { Cookie: cookie } : {}) },
    data: route.method === "GET" ? undefined : data,
    maxRedirects: 0,
  });
}

async function expectDenied(request: APIRequestContext, route: Guarded, cookie: string | undefined, label: string) {
  const response = await call(request, route, cookie);
  const where = `${route.method} ${route.path} (${label})`;
  if (route.denied === "login") {
    expect(response.status(), where).toBe(307);
    expect(new URL(response.headers().location, baseURL).pathname, where).toBe("/login");
  } else {
    expect(response.status(), where).toBe(route.denied);
  }
}

test("every API route is declared as guarded or deliberately public", () => {
  const apiRoot = join(process.cwd(), "src", "app", "api");
  const onDisk = (readdirSync(apiRoot, { recursive: true }) as string[])
    .filter((file) => file.endsWith(`${sep}route.ts`))
    .map((file) => `/api/${relative(apiRoot, join(apiRoot, file)).split(sep).slice(0, -1).join("/")}`)
    .sort();
  const declared = [...new Set([...GUARDED_ROUTES.map((route) => route.path), ...Object.keys(PUBLIC_ROUTES)])].sort();
  expect(onDisk, "Declare each new API route in tests/security.spec.ts").toEqual(declared);
});

test("missing, unsigned and forged session cookies are refused everywhere", async ({ request, page }) => {
  test.setTimeout(60000);
  const victim = "victime@example.invalid";
  const attacker = "attaquant@example.invalid";
  const victimPayload = createSessionToken(victim, 0, requireSecret()).split(".")[0];
  const attackerSignature = sessionSignature(sessionCookie(attacker));
  const forgeries: Record<string, string | undefined> = {
    "no cookie": undefined,
    "plain email, legacy cookie name": `pepito_session_email=${victim}`,
    "plain email": `pepito_session=${victim}`,
    "payload without signature": `pepito_session=${victimPayload}`,
    "signed with another secret": sessionCookie(victim, 0, Date.now(), "not-the-server-secret"),
    "another account's signature on the victim's email": `pepito_session=${victimPayload}.${attackerSignature}`,
    "truncated signature": sessionCookie(victim).slice(0, -1),
  };
  for (const [label, cookie] of Object.entries(forgeries)) {
    for (const route of GUARDED_ROUTES) await expectDenied(request, route, cookie, label);
    await page.context().clearCookies();
    if (cookie) {
      const separator = cookie.indexOf("=");
      await page.context().addCookies([{ name: cookie.slice(0, separator), value: cookie.slice(separator + 1), url: baseURL }]);
    }
    for (const path of GUARDED_PAGES) {
      await page.goto(`${baseURL}${path}`);
      await expect(page, `${path} (${label})`).toHaveURL(`${baseURL}/login`);
      await expect(page.getByRole("button", { name: "Continuer", exact: true }), `${path} (${label})`).toBeVisible();
    }
  }
  const cron = await request.get(`${baseURL}/api/cron/weekly-review`, { headers: { Authorization: "Bearer wrong-secret" } });
  expect([401, 500]).toContain(cron.status());
});

test("login does not create unknown accounts; signup is explicit", async ({ request }) => {
  const prisma = openDatabase();
  const email = `security-signup-${randomUUID()}@example.invalid`;
  const password = "mot-de-passe-valide";
  try {
    const missingLogin = await request.post(`${baseURL}/api/auth/login`, { data: { email, password } });
    expect(missingLogin.status()).toBe(404);
    expect((await missingLogin.json()).error).toContain("Aucun compte associé à cet email");
    expect(await prisma.company.count({ where: { ownerEmail: email } })).toBe(0);

    const signup = await request.post(`${baseURL}/api/auth/signup`, { data: { email, password } });
    expect(signup.status()).toBe(201);
    expect(signup.headers()["set-cookie"]).toContain("pepito_session=");
    expect(signup.headers()["set-cookie"].toLowerCase()).toContain("httponly");
    expect(signup.headers()["set-cookie"].toLowerCase()).toContain("expires=");
    expect(await signup.json()).toMatchObject({ hasCompany: false });
    expect(await prisma.company.count({ where: { ownerEmail: email } })).toBe(1);

    const duplicateSignup = await request.post(`${baseURL}/api/auth/signup`, { data: { email, password } });
    expect(duplicateSignup.status()).toBe(409);
    expect(await prisma.company.count({ where: { ownerEmail: email } })).toBe(1);
  } finally {
    await prisma.company.deleteMany({ where: { ownerEmail: email } });
    await prisma.$disconnect();
  }
});

test("sessions expire and logout or password changes revoke every active cookie", async ({ request }) => {
  const prisma = openDatabase();
  const email = `security-session-${randomUUID()}@example.invalid`;
  const company = await prisma.company.create({ data: {
    ownerEmail: email, passwordHash: await hashPassword("ancien-mot-de-passe"), name: "Session Test", trade: "Artisan", servingArea: "Paris",
  } });
  const firstSession = sessionCookie(email, company.sessionVersion);
  const secondSession = sessionCookie(email, company.sessionVersion);
  const expiredSession = sessionCookie(email, company.sessionVersion, Date.now() - (SESSION_MAX_AGE_SECONDS + 60) * 1000);
  try {
    expect((await request.get(`${baseURL}/api/companies`, { headers: { Cookie: firstSession } })).status()).toBe(200);
    expect((await request.get(`${baseURL}/api/companies`, { headers: { Cookie: expiredSession } })).status()).toBe(401);

    const passwordChange = await request.post(`${baseURL}/api/auth/password`, {
      headers: { Cookie: firstSession, Origin: baseURL },
      data: { currentPassword: "ancien-mot-de-passe", newPassword: "nouveau-mot-de-passe" },
    });
    expect(passwordChange.status()).toBe(200);
    expect(await passwordChange.json()).toEqual({ passwordChanged: true, reconnectRequired: true });
    for (const cookie of [firstSession, secondSession]) {
      expect((await request.get(`${baseURL}/api/companies`, { headers: { Cookie: cookie } })).status()).toBe(401);
    }

    const login = await request.post(`${baseURL}/api/auth/login`, { data: { email, password: "nouveau-mot-de-passe" } });
    expect(login.status()).toBe(200);
    const renewedCookie = login.headers()["set-cookie"].split(";")[0];
    expect((await request.get(`${baseURL}/api/companies`, { headers: { Cookie: renewedCookie } })).status()).toBe(200);

    const forgedLogout = await request.post(`${baseURL}/api/auth/logout`, { headers: { Cookie: renewedCookie, Origin: "https://attacker.invalid" }, maxRedirects: 0 });
    expect(forgedLogout.status()).toBe(403);
    expect((await request.get(`${baseURL}/api/companies`, { headers: { Cookie: renewedCookie } })).status()).toBe(200);
    const logout = await request.post(`${baseURL}/api/auth/logout`, { headers: { Cookie: renewedCookie, Origin: baseURL }, maxRedirects: 0 });
    expect(logout.status()).toBe(307);
    expect((await request.get(`${baseURL}/api/companies`, { headers: { Cookie: renewedCookie } })).status()).toBe(401);
    expect((await prisma.company.findUniqueOrThrow({ where: { id: company.id } })).sessionVersion).toBe(2);
  } finally {
    await prisma.company.delete({ where: { id: company.id } });
    await prisma.$disconnect();
  }
});

test("five wrong passwords lock the account, even for the right password", async ({ request }) => {
  const prisma = openDatabase();
  const email = `security-lock-${randomUUID()}@example.invalid`;
  const password = "mot-de-passe-correct";
  const login = (candidate: string) => request.post(`${baseURL}/api/auth/login`, { data: { email, password: candidate } });
  try {
    expect((await request.post(`${baseURL}/api/auth/signup`, { data: { email, password } })).status()).toBe(201);
    for (let attempt = 1; attempt <= 4; attempt++) {
      const wrong = await login("mauvais-mot-de-passe");
      expect(wrong.status(), `attempt ${attempt}`).toBe(401);
      expect(wrong.headers()["set-cookie"], `attempt ${attempt}`).toBeUndefined();
    }
    expect((await login("mauvais-mot-de-passe")).status()).toBe(429);
    const locked = await login(password);
    expect(locked.status()).toBe(429);
    expect(locked.headers()["set-cookie"]).toBeUndefined();
    const company = await prisma.company.findUniqueOrThrow({ where: { ownerEmail: email } });
    expect(company.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
    // Le verrou expiré, le bon mot de passe reconnecte et remet le compteur à zéro.
    await prisma.company.update({ where: { id: company.id }, data: { lockedUntil: new Date(Date.now() - 1000) } });
    expect((await login(password)).status()).toBe(200);
    expect((await prisma.company.findUniqueOrThrow({ where: { id: company.id } })).failedLoginAttempts).toBe(0);
  } finally {
    await prisma.company.deleteMany({ where: { ownerEmail: email } });
    await prisma.$disconnect();
  }
});

test("a signed-in company cannot read or change another company's data", async ({ request }) => {
  const prisma = openDatabase();
  const secretMarker = `secret-${randomUUID()}`;
  const profile = { trade: "Artisan", servingArea: "Paris" };
  const intruder = await prisma.company.create({ data: { ...profile, ownerEmail: `security-a-${randomUUID()}@example.invalid`, name: "Intrus Test" } });
  const target = await prisma.company.create({ data: { ...profile, ownerEmail: `security-b-${randomUUID()}@example.invalid`, name: secretMarker } });
  try {
    const planItem = await prisma.actionPlanItem.create({ data: { companyId: target.id, agent: "contenu", title: secretMarker, rationale: secretMarker, timing: "Cette semaine" } });
    const proposal = await prisma.agentProposal.create({ data: { companyId: target.id, agent: "contenu", kind: "site_web_content", title: secretMarker, content: secretMarker, status: "validee" } });
    const lead = await prisma.lead.create({ data: { companyId: target.id, name: secretMarker, reason: secretMarker, stage: "a_contacter" } });
    await prisma.auditFinding.create({ data: { companyId: target.id, category: "site_web", title: secretMarker, content: secretMarker } });
    await prisma.chatMessage.create({ data: { companyId: target.id, role: "assistant", content: secretMarker } });

    const cookie = sessionCookie(intruder.ownerEmail, intruder.sessionVersion);
    const writes: [Pick<Guarded, "method" | "path">, unknown][] = [
      [{ method: "PATCH", path: `/api/proposals/${proposal.id}` }, { status: "rejetee" }],
      [{ method: "POST", path: `/api/proposals/${proposal.id}/execute` }, {}],
      [{ method: "PATCH", path: `/api/leads/${lead.id}` }, { stage: "gagne" }],
      [{ method: "PATCH", path: `/api/action-plan/${planItem.id}` }, { status: "ecarte" }],
      [{ method: "POST", path: `/api/action-plan/${planItem.id}/launch` }, {}],
    ];
    for (const [route, data] of writes) {
      expect((await call(request, route, cookie, data)).status(), `${route.method} ${route.path}`).toBe(404);
    }
    // Suppose ADMIN_EMAILS défini côté serveur, comme en CI : sans liste, l'administration reste ouverte à tout connecté.
    const removal = await call(request, { method: "DELETE", path: `/api/admin/companies/${target.id}` }, cookie);
    expect(removal.status(), "DELETE /api/admin/companies/[id] needs ADMIN_EMAILS on the server").toBe(403);

    expect((await prisma.agentProposal.findUniqueOrThrow({ where: { id: proposal.id } })).status).toBe("validee");
    expect(await prisma.executionLog.count({ where: { proposalId: proposal.id } })).toBe(0);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).stage).toBe("a_contacter");
    expect((await prisma.actionPlanItem.findUniqueOrThrow({ where: { id: planItem.id } })).status).toBe("propose");
    expect((await prisma.company.findUniqueOrThrow({ where: { id: target.id } })).siteHtml).toBeNull();

    for (const path of ["/api/companies", "/api/proposals", "/api/audit-findings", "/api/co-ceo/messages", "/api/co-ceo/plan"]) {
      const response = await call(request, { method: "GET", path }, cookie);
      expect(response.status(), path).toBe(200);
      const body = await response.text();
      expect(body, path).not.toContain(secretMarker);
      expect(body, path).not.toContain(target.id);
    }
    for (const path of ["/dashboard", "/dashboard?view=validation", "/dashboard?view=historique", "/prospection", "/diagnostic", "/rapport"]) {
      const page = await request.get(`${baseURL}${path}`, { headers: { Cookie: cookie } });
      expect(page.status(), path).toBe(200);
      expect(await page.text(), path).not.toContain(secretMarker);
    }
  } finally {
    await prisma.company.deleteMany({ where: { id: { in: [intruder.id, target.id] } } });
    await prisma.$disconnect();
  }
});
