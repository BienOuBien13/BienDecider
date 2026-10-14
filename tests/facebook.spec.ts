import { test, expect } from "@playwright/test";
import { createHmac, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { requireLocalDatabase } from "./support/local-database";
import { createSessionToken } from "../src/lib/session-token";
import { buildMetaAuthUrl, createMetaState, decryptFacebookAccount, encryptFacebookAccount, exchangeMetaCode,
  facebookConnectionView, FACEBOOK_SCOPES, isMetaOAuthConfigured, META_CALLBACK, META_GRAPH_VERSION, META_STATE_COOKIE,
  MetaOAuthError, revokeFacebookAuthorization, verifyFacebookPage, verifyMetaState, type FacebookAccount } from "../src/lib/oauth/meta";

const baseURL = process.env.UX_TEST_BASE_URL ?? "http://localhost:3000";
// Mêmes valeurs factices que le serveur lancé par la CI (.github/workflows/ci.yml) : elles ne sont jamais envoyées à Meta.
const APP_SECRET = "ci-meta-secret";
const account: FacebookAccount = {
  userToken: "private-user-token", userId: "1000001", userName: "Dirigeante de test", scopes: [...FACEBOOK_SCOPES], selectedPageId: null,
  pages: [
    { id: "2000001", name: "Atelier Test · Page principale", token: "private-page-token-1", canPublish: true },
    { id: "2000002", name: "Page en lecture seule", token: "private-page-token-2", canPublish: false },
  ],
};

test.beforeEach(() => {
  process.env.META_APP_ID = "ci-meta-app";
  process.env.META_APP_SECRET = APP_SECRET;
  process.env.META_TOKEN_ENCRYPTION_KEY = "d".repeat(64);
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// Faux Meta : répond selon le chemin appelé et garde la trace des requêtes, sans aucun accès réseau.
function fakeMeta(overrides: Record<string, () => Response> = {}) {
  const calls: { url: URL; authorization: string | null; method: string }[] = [];
  const routes: Record<string, () => Response> = {
    "oauth/access_token": () => json({ access_token: "private-user-token", expires_in: 5184000 }),
    "me/permissions": () => json({ data: FACEBOOK_SCOPES.map((permission) => ({ permission, status: "granted" })) }),
    "me": () => json({ id: account.userId, name: account.userName }),
    "me/accounts": () => json({ data: [
      { id: "2000001", name: "Atelier Test · Page principale", access_token: "private-page-token-1", tasks: ["ADVERTISE", "CREATE_CONTENT"] },
      { id: "2000002", name: "Page en lecture seule", access_token: "private-page-token-2", tasks: ["ANALYZE"] },
    ] }),
    ...overrides,
  };
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url, authorization: new Headers(init?.headers).get("authorization"), method: init?.method ?? "GET" });
    const path = url.pathname.replace(`/${META_GRAPH_VERSION}/`, "");
    return (routes[path] ?? (() => json({ error: { message: "unknown" } }, 404)))();
  }) as typeof fetch;
  return { fetchImpl, calls };
}

async function diagnosticOf(promise: Promise<unknown>) {
  try { await promise; } catch (error) { return error instanceof MetaOAuthError ? error.diagnostic : `other:${String(error)}`; }
  return "no error";
}

test("Facebook auth asks only for Page permissions on the verified Graph version, without the app secret", () => {
  expect(isMetaOAuthConfigured()).toBe(true);
  const callback = `https://www.biendecider.com${META_CALLBACK}`;
  const url = new URL(buildMetaAuthUrl(callback, "test-state"));
  expect(url.origin + url.pathname).toBe("https://www.facebook.com/v26.0/dialog/oauth");
  expect(url.searchParams.get("redirect_uri")).toBe(callback);
  expect(url.searchParams.get("state")).toBe("test-state");
  expect(url.searchParams.get("response_type")).toBe("code");
  expect(url.searchParams.get("scope")?.split(",")).toEqual(["pages_show_list", "pages_read_engagement", "pages_manage_posts"]);
  expect(url.toString()).not.toContain(APP_SECRET);
  expect(url.toString()).not.toContain("instagram");

  process.env.META_TOKEN_ENCRYPTION_KEY = "too-short";
  expect(isMetaOAuthConfigured()).toBe(false);
  expect(() => buildMetaAuthUrl(callback, "test-state")).toThrow();
});

test("the OAuth state is bound to the company, the session and the callback, and expires", () => {
  const binding = { companyId: "company-a", session: "session-a", redirectUri: `https://www.biendecider.com${META_CALLBACK}` };
  const now = Date.now();
  const state = createMetaState(binding, now);
  expect(verifyMetaState(state, binding, now + 1000)).toBe(true);
  expect(createMetaState(binding, now)).not.toBe(state);

  expect(verifyMetaState(state, binding, now + 10 * 60 * 1000 + 1)).toBe(false);
  expect(verifyMetaState(state, { ...binding, companyId: "company-b" }, now)).toBe(false);
  expect(verifyMetaState(state, { ...binding, session: "session-b" }, now)).toBe(false);
  expect(verifyMetaState(state, { ...binding, redirectUri: "https://attacker.example/callback" }, now)).toBe(false);
  const [nonce, expires, signature] = state.split(".");
  expect(verifyMetaState(`${nonce}.${Number(expires) + 60000}.${signature}`, binding, now)).toBe(false);
  const changedSignature = `${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`;
  expect(verifyMetaState(`${nonce}.${expires}.${changedSignature}`, binding, now)).toBe(false);
  for (const malformed of [null, undefined, "", "a.b", `${state}.extra`, "a.not-a-number.c"]) expect(verifyMetaState(malformed, binding, now)).toBe(false);
});

test("Facebook tokens are encrypted, bound to the company and reject tampering", () => {
  const encrypted = encryptFacebookAccount(account, "company-a");
  expect(encrypted.startsWith("v1.")).toBe(true);
  for (const secret of ["private-user-token", "private-page-token-1", "Dirigeante"]) expect(encrypted).not.toContain(secret);
  expect(encryptFacebookAccount(account, "company-a")).not.toBe(encrypted);
  expect(decryptFacebookAccount(encrypted, "company-a")).toEqual(account);

  expect(() => decryptFacebookAccount(encrypted, "company-b")).toThrow();
  const parts = encrypted.split(".");
  expect(() => decryptFacebookAccount([parts[0], parts[1], parts[2], parts[3].slice(0, -2) + "AA"].join("."), "company-a")).toThrow();
  expect(() => decryptFacebookAccount("private-user-token", "company-a")).toThrow();
  process.env.META_TOKEN_ENCRYPTION_KEY = "e".repeat(64);
  expect(() => decryptFacebookAccount(encrypted, "company-a")).toThrow();
  expect(() => encryptFacebookAccount({ ...account, scopes: ["pages_show_list"] }, "company-a")).toThrow();
});

test("the code exchange checks granted permissions and lists Pages, with tokens kept out of URLs", async () => {
  const callback = `https://www.biendecider.com${META_CALLBACK}`;
  const meta = fakeMeta();
  const result = await exchangeMetaCode("auth-code", callback, meta.fetchImpl);
  expect(result.account).toEqual(account);
  expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now() + 59 * 24 * 60 * 60 * 1000);

  const paths = meta.calls.map((call) => call.url.pathname.replace(`/${META_GRAPH_VERSION}/`, ""));
  expect(paths).toEqual(["oauth/access_token", "oauth/access_token", "me/permissions", "me", "me/accounts"]);
  expect(meta.calls.every((call) => call.url.origin === "https://graph.facebook.com")).toBe(true);
  expect(meta.calls[0].url.searchParams.get("code")).toBe("auth-code");
  expect(meta.calls[0].url.searchParams.get("redirect_uri")).toBe(callback);
  expect(meta.calls[1].url.searchParams.get("grant_type")).toBe("fb_exchange_token");
  const proof = createHmac("sha256", APP_SECRET).update("private-user-token").digest("hex");
  for (const call of meta.calls.slice(2)) {
    expect(call.authorization).toBe("Bearer private-user-token");
    expect(call.url.searchParams.get("appsecret_proof")).toBe(proof);
    expect(call.url.toString()).not.toContain("private-user-token");
    expect(call.url.toString()).not.toContain(APP_SECRET);
  }

  const declined = fakeMeta({ "me/permissions": () => json({ data: [
    { permission: "pages_show_list", status: "granted" }, { permission: "pages_read_engagement", status: "granted" }, { permission: "pages_manage_posts", status: "declined" },
  ] }) });
  expect(await diagnosticOf(exchangeMetaCode("auth-code", callback, declined.fetchImpl))).toBe("meta_scope");
  expect(declined.calls.map((call) => call.url.pathname)).not.toContain(`/${META_GRAPH_VERSION}/me/accounts`);

  expect(await diagnosticOf(exchangeMetaCode("auth-code", callback, fakeMeta({ "me/accounts": () => json({ data: [] }) }).fetchImpl))).toBe("meta_no_page");
  expect(await diagnosticOf(exchangeMetaCode("auth-code", callback, fakeMeta({ "oauth/access_token": () => json({ error: { message: "bad code" } }, 400) }).fetchImpl))).toBe("meta_token_request");
  expect(await diagnosticOf(exchangeMetaCode("auth-code", callback, fakeMeta({ "oauth/access_token": () => json({ token: "wrong shape" }) }).fetchImpl))).toBe("meta_token_response");
  expect(await diagnosticOf(exchangeMetaCode("auth-code", callback, fakeMeta({ "me": () => json({}, 500) }).fetchImpl))).toBe("meta_profile");
  const offline = (async () => { throw new Error("network down"); }) as unknown as typeof fetch;
  expect(await diagnosticOf(exchangeMetaCode("auth-code", callback, offline))).toBe("meta_token_request");
});

test("a Page is verified with its own token, and revocation never throws", async () => {
  const page = { id: "2000001", token: "private-page-token-1" };
  const meta = fakeMeta({ "2000001": () => json({ id: "2000001", name: "Nom actuel de la Page" }) });
  expect(await verifyFacebookPage(page, meta.fetchImpl)).toEqual({ id: "2000001", name: "Nom actuel de la Page" });
  expect(meta.calls[0].authorization).toBe("Bearer private-page-token-1");
  expect(meta.calls[0].url.toString()).not.toContain("private-page-token-1");
  expect(await verifyFacebookPage(page, fakeMeta({ "2000001": () => json({ id: "9999999", name: "Autre Page" }) }).fetchImpl)).toBeNull();
  expect(await verifyFacebookPage(page, fakeMeta({ "2000001": () => json({ error: {} }, 400) }).fetchImpl)).toBeNull();

  const revocation = fakeMeta({ "1000001/permissions": () => json({ success: true }) });
  expect(await revokeFacebookAuthorization(account, revocation.fetchImpl)).toBe(true);
  expect(revocation.calls[0].method).toBe("DELETE");
  expect(await revokeFacebookAuthorization(account, fakeMeta().fetchImpl)).toBe(false);
  expect(await revokeFacebookAuthorization(account, (async () => { throw new Error("network down"); }) as unknown as typeof fetch)).toBe(false);
});

test("the connection view never exposes a token and never calls an unreadable row a connection", () => {
  const now = Date.now();
  const soon = new Date(now + 60000);
  expect(facebookConnectionView(undefined, "company-a", now)).toEqual({ status: "disconnected" });
  // Jeton en clair de l'ancien flux, ou ligne d'une autre entreprise : à refaire.
  expect(facebookConnectionView({ status: "connecte", accessToken: "legacy-plain-token", expiresAt: soon }, "company-a", now)).toEqual({ status: "error" });
  const pending = encryptFacebookAccount(account, "company-a");
  expect(facebookConnectionView({ status: "selection_requise", accessToken: pending, expiresAt: soon }, "company-b", now)).toEqual({ status: "error" });

  const selection = facebookConnectionView({ status: "selection_requise", accessToken: pending, expiresAt: soon }, "company-a", now);
  expect(selection).toEqual({ status: "selection", userName: "Dirigeante de test", pages: [
    { id: "2000001", name: "Atelier Test · Page principale", canPublish: true }, { id: "2000002", name: "Page en lecture seule", canPublish: false },
  ] });
  expect(JSON.stringify(selection)).not.toContain("private-");
  expect(facebookConnectionView({ status: "selection_requise", accessToken: pending, expiresAt: new Date(now - 1) }, "company-a", now)).toEqual({ status: "error" });
  // Autorisé sans Page choisie n'est jamais « connecté ».
  expect(facebookConnectionView({ status: "connecte", accessToken: pending, expiresAt: null }, "company-a", now)).toEqual({ status: "error" });

  const chosen = encryptFacebookAccount({ ...account, pages: [account.pages[0]], selectedPageId: "2000001" }, "company-a");
  expect(facebookConnectionView({ status: "connecte", accessToken: chosen, expiresAt: null }, "company-a", now))
    .toEqual({ status: "connected", userName: "Dirigeante de test", pageName: "Atelier Test · Page principale" });
});

test("Facebook routes: start, refused or forged callbacks, Page choice guards and disconnection", async ({ request }) => {
  requireLocalDatabase("Facebook tests");
  if (!process.env.SESSION_SECRET) throw new Error("SESSION_SECRET is required for Facebook tests.");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  const profile = { name: "Atelier Test Facebook", trade: "Artisan", servingArea: "Paris" };
  const company = await prisma.company.create({ data: { ...profile, ownerEmail: `facebook-test-${randomUUID()}@example.invalid` } });
  const other = await prisma.company.create({ data: { ...profile, ownerEmail: `facebook-other-${randomUUID()}@example.invalid` } });
  const session = (email: string, sessionVersion: number) => createSessionToken(email, sessionVersion, process.env.SESSION_SECRET!);
  const headers = { Cookie: `pepito_session=${session(company.ownerEmail, company.sessionVersion)}`, Origin: baseURL };
  const redirectUri = `${baseURL}${META_CALLBACK}`;
  const connection = () => prisma.channelConnection.findUnique({ where: { companyId_channel: { companyId: company.id, channel: "facebook" } } });
  try {
    // Départ : redirection vers Facebook avec un state signé, posé en cookie restreint au flux.
    const start = await request.get(`${baseURL}/api/oauth/meta/start`, { headers, maxRedirects: 0 });
    expect(start.status()).toBe(307);
    const authorization = new URL(start.headers().location);
    expect(authorization.hostname).toBe("www.facebook.com");
    expect(authorization.searchParams.get("redirect_uri")).toBe(redirectUri);
    const state = authorization.searchParams.get("state")!;
    const setCookie = start.headers()["set-cookie"];
    expect(setCookie).toContain(`${META_STATE_COOKIE}=`);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toContain("Path=/api/oauth/meta");
    expect(verifyMetaState(state, { companyId: company.id, session: session(company.ownerEmail, company.sessionVersion), redirectUri })).toBe(true);
    expect((await request.get(`${baseURL}/api/oauth/meta/start`, { headers: { ...headers, "Sec-Fetch-Site": "cross-site" }, maxRedirects: 0 })).status()).toBe(403);

    // Retour : une connexion existante n'est jamais modifiée par un refus ou un state invalide.
    const existing = encryptFacebookAccount({ ...account, pages: [account.pages[0]], selectedPageId: "2000001" }, company.id);
    await prisma.channelConnection.create({ data: { companyId: company.id, channel: "facebook", status: "connecte", accessToken: existing } });
    const callback = (query: string, cookie: string) => request.get(`${redirectUri}?${query}`, { headers: { Cookie: cookie }, maxRedirects: 0 });
    const withState = `${headers.Cookie}; ${META_STATE_COOKIE}=${state}`;
    const outcome = async (query: string, cookie: string) => new URL((await callback(query, cookie)).headers().location, baseURL).searchParams.get("error");
    expect(await outcome(`state=${encodeURIComponent(state)}&error=access_denied`, withState)).toBe("meta_denied");
    expect(await outcome(`state=${encodeURIComponent(state)}&code=abc`, headers.Cookie)).toBe("meta_state");
    expect(await outcome(`state=forged&code=abc`, withState)).toBe("meta_state");
    expect(await outcome(`state=forged&code=abc`, `${headers.Cookie}; ${META_STATE_COOKIE}=forged`)).toBe("meta_state");
    const foreignState = createMetaState({ companyId: other.id, session: session(other.ownerEmail, other.sessionVersion), redirectUri });
    expect(await outcome(`state=${encodeURIComponent(foreignState)}&code=abc`, `${headers.Cookie}; ${META_STATE_COOKIE}=${foreignState}`)).toBe("meta_state");
    expect(await outcome(`state=${encodeURIComponent(state)}`, withState)).toBe("meta_state");
    expect((await connection())?.accessToken).toBe(existing);

    // Choix de la Page : rien en attente, Page inconnue, rôle insuffisant. Aucun de ces refus n'appelle Meta.
    const choose = (pageId: unknown, extra: Record<string, string> = headers) => request.post(`${baseURL}/api/facebook/page`, { headers: extra, data: { pageId } });
    expect((await choose("2000001")).status()).toBe(409);
    const pending = encryptFacebookAccount(account, company.id);
    await prisma.channelConnection.update({ where: { companyId_channel: { companyId: company.id, channel: "facebook" } }, data: { status: "selection_requise", accessToken: pending, expiresAt: new Date(Date.now() + 600000) } });
    expect((await choose("")).status()).toBe(400);
    expect((await choose("9999999")).status()).toBe(400);
    expect((await choose("2000002")).status()).toBe(400);
    expect((await choose("2000001", { ...headers, Origin: "https://untrusted.example" })).status()).toBe(403);
    expect((await choose("2000001", { Cookie: `pepito_session=${session(other.ownerEmail, other.sessionVersion)}`, Origin: baseURL })).status()).toBe(409);
    expect((await connection())?.status).toBe("selection_requise");

    // La page Connexions propose les Pages par leur nom, sans aucun jeton.
    const page = await (await request.get(`${baseURL}/connexions`, { headers })).text();
    expect(page).toContain("Autorisation reçue · choisissez la Page à connecter");
    expect(page).toContain("Atelier Test · Page principale");
    expect(page).toContain("Page en lecture seule");
    expect(page).not.toContain("private-");
    await prisma.channelConnection.update({ where: { companyId_channel: { companyId: company.id, channel: "facebook" } }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await choose("2000001")).status()).toBe(409);

    // Déconnexion : confirmation exigée, effacement local même si la ligne est illisible, isolée par entreprise.
    const legacy = { status: "connecte", accessToken: "legacy-plain-token" };
    await prisma.channelConnection.update({ where: { companyId_channel: { companyId: company.id, channel: "facebook" } }, data: legacy });
    await prisma.channelConnection.create({ data: { companyId: other.id, channel: "facebook", ...legacy } });
    const disconnect = (data: unknown) => request.post(`${baseURL}/api/facebook/disconnect`, { headers, data });
    expect((await disconnect({})).status()).toBe(400);
    expect(await connection()).not.toBeNull();
    const removed = await disconnect({ confirmed: true });
    expect(await removed.json()).toEqual({ disconnected: true, revoked: false });
    expect(await connection()).toBeNull();
    expect(await prisma.channelConnection.count({ where: { companyId: other.id, channel: "facebook" } })).toBe(1);
  } finally {
    await prisma.company.deleteMany({ where: { id: { in: [company.id, other.id] } } });
    await prisma.$disconnect();
  }
});
