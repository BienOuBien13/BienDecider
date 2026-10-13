import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { z } from "zod";

export const LINKEDIN_CALLBACK = "/api/oauth/linkedin/callback";
export const LINKEDIN_SCOPES = ["openid", "profile", "w_member_social"] as const;
export const LINKEDIN_STATE_COOKIE = "biendecider_linkedin_oauth";
const oauthOrigin = "https://www.linkedin.com";
const issuer = "https://www.linkedin.com/oauth";
const signingKeys = createRemoteJWKSet(new URL(`${oauthOrigin}/oauth/openid/jwks`), { timeoutDuration: 10000 });

export const linkedInAccountSchema = z.object({
  token: z.string().min(1).max(10000),
  subject: z.string().min(1).max(255),
  name: z.string().min(1).max(300),
  scopes: z.array(z.string()).refine((scopes) => LINKEDIN_SCOPES.every((scope) => scopes.includes(scope))),
});

export function hashLinkedInState(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function isLinkedInConfigured() {
  return Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET &&
    /^[a-f0-9]{64}$/i.test(process.env.LINKEDIN_TOKEN_ENCRYPTION_KEY ?? ""));
}

function encryptionKey() {
  const key = process.env.LINKEDIN_TOKEN_ENCRYPTION_KEY ?? "";
  if (!/^[a-f0-9]{64}$/i.test(key)) throw new Error("Chiffrement LinkedIn non configuré.");
  return Buffer.from(key, "hex");
}

export function encryptLinkedInAccount(account: z.infer<typeof linkedInAccountSchema>, companyId: string) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), nonce);
  cipher.setAAD(Buffer.from(`linkedin:${companyId}`));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(linkedInAccountSchema.parse(account)), "utf8"), cipher.final()]);
  return ["v1", nonce.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptLinkedInAccount(value: string, companyId: string) {
  const parts = value.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") throw new Error("Autorisation LinkedIn invalide.");
  const [, nonce, tag, ciphertext] = parts;
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(nonce, "base64url"));
  decipher.setAAD(Buffer.from(`linkedin:${companyId}`));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return linkedInAccountSchema.parse(JSON.parse(Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final(),
  ]).toString("utf8")));
}

export function buildLinkedInAuthUrl(redirectUri: string, state: string, nonce: string) {
  if (!isLinkedInConfigured()) throw new Error("LinkedIn non configuré.");
  const params = new URLSearchParams({
    response_type: "code", client_id: process.env.LINKEDIN_CLIENT_ID!, redirect_uri: redirectUri,
    state, nonce, scope: LINKEDIN_SCOPES.join(" "),
  });
  return `${oauthOrigin}/oauth/v2/authorization?${params}`;
}

export async function verifyLinkedInIdentity(idToken: string, nonce: string, keys: JWTVerifyGetKey = signingKeys) {
  if (!process.env.LINKEDIN_CLIENT_ID) throw new Error("Audience LinkedIn non configurée.");
  const { payload } = await jwtVerify(idToken, keys, {
    issuer, audience: process.env.LINKEDIN_CLIENT_ID, algorithms: ["RS256"],
    requiredClaims: ["iss", "aud", "exp", "iat", "sub", "nonce"],
    maxTokenAge: "10m", clockTolerance: 5,
  });
  if (payload.nonce !== nonce || !payload.sub) throw new Error("Identité LinkedIn invalide.");
  return payload.sub;
}

const tokenSchema = z.object({
  access_token: z.string().min(1).max(10000),
  id_token: z.string().min(1).max(20000),
  expires_in: z.number().int().positive().max(366 * 24 * 60 * 60),
  scope: z.string().min(1),
});

export async function exchangeLinkedInCode(code: string, redirectUri: string, nonce: string, keys: JWTVerifyGetKey = signingKeys) {
  if (!isLinkedInConfigured()) throw new Error("LinkedIn non configuré.");
  const response = await fetch(`${oauthOrigin}/oauth/v2/accessToken`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri,
      client_id: process.env.LINKEDIN_CLIENT_ID!, client_secret: process.env.LINKEDIN_CLIENT_SECRET! }),
    signal: AbortSignal.timeout(10000), cache: "no-store",
  });
  if (!response.ok) throw new Error("Échange LinkedIn refusé.");
  const tokens = tokenSchema.parse(await response.json());
  const scopes = tokens.scope.split(/[\s,]+/).filter(Boolean);
  if (!LINKEDIN_SCOPES.every((scope) => scopes.includes(scope))) throw new Error("Permissions LinkedIn incomplètes.");
  const subject = await verifyLinkedInIdentity(tokens.id_token, nonce, keys);
  const identityResponse = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` }, signal: AbortSignal.timeout(10000), cache: "no-store",
  });
  if (!identityResponse.ok) throw new Error("Profil LinkedIn indisponible.");
  const identity = z.object({ sub: z.string().min(1), name: z.string().min(1).max(300) }).parse(await identityResponse.json());
  if (identity.sub !== subject) throw new Error("Identité LinkedIn incohérente.");
  return {
    account: linkedInAccountSchema.parse({ token: tokens.access_token, subject, name: identity.name, scopes }),
    expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
  };
}