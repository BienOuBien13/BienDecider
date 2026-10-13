import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { z } from "zod";

export const LINKEDIN_CALLBACK = "/api/oauth/linkedin/callback";
export const LINKEDIN_SCOPES = ["openid", "profile", "w_member_social"] as const;
export const LINKEDIN_STATE_COOKIE = "biendecider_linkedin_oauth";
const oauthOrigin = "https://www.linkedin.com";
const issuer = "https://www.linkedin.com/oauth";
const signingKeys = createRemoteJWKSet(new URL(`${oauthOrigin}/oauth/openid/jwks`), { timeoutDuration: 10000 });

export const LINKEDIN_ERROR_MESSAGES = {
  linkedin_config: "LinkedIn n'est pas configuré sur ce déploiement.",
  linkedin_token_request: "LinkedIn a refusé l'échange du code ou n'a pas répondu. Vérifiez le client OAuth et recommencez depuis Connexions.",
  linkedin_token_response: "La réponse OAuth LinkedIn ne contient pas les informations attendues.",
  linkedin_scope: "Les permissions LinkedIn accordées sont incomplètes. Vérifiez openid, profile et w_member_social dans Auth.",
  linkedin_identity: "La signature ou les informations du jeton d'identité LinkedIn n'ont pas pu être vérifiées.",
  linkedin_identity_nonce: "LinkedIn n'a pas renvoyé le nonce attendu dans son jeton d'identité.",
  linkedin_identity_nonce_missing: "Le jeton d'identité signé par LinkedIn ne contient pas de nonce. L'autorisation est refusée pour éviter une réutilisation de jeton.",
  linkedin_identity_issuer: "L'émetteur du jeton LinkedIn ne correspond pas à la configuration OIDC.",
  linkedin_identity_audience: "Le jeton LinkedIn est destiné à une autre application OAuth.",
  linkedin_identity_time: "Le jeton d'identité LinkedIn est expiré ou sa date n'est pas valide. Recommencez l'autorisation.",
  linkedin_profile_request: "Impossible de lire le profil autorisé auprès de LinkedIn.",
  linkedin_profile_response: "LinkedIn n'a pas renvoyé un identifiant et un nom de profil valides.",
  linkedin_profile_subject: "Le profil LinkedIn ne correspond pas au jeton d'identité reçu.",
  linkedin_storage: "L'autorisation LinkedIn n'a pas pu être enregistrée. Réessayez ou contactez le support.",
} as const;

export class LinkedInOAuthError extends Error {
  constructor(readonly diagnostic: keyof typeof LINKEDIN_ERROR_MESSAGES) {
    super(LINKEDIN_ERROR_MESSAGES[diagnostic]);
    this.name = "LinkedInOAuthError";
  }
}

async function checkedStage<Result>(diagnostic: keyof typeof LINKEDIN_ERROR_MESSAGES, operation: () => Promise<Result>): Promise<Result> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof LinkedInOAuthError) throw error;
    throw new LinkedInOAuthError(diagnostic);
  }
}

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
    state, scope: LINKEDIN_SCOPES.join(" "),
    enable_extended_login: "true",
  });
  if (nonce) params.set("nonce", nonce);
  return `${oauthOrigin}/oauth/v2/authorization?${params}`;
}

export async function verifyLinkedInIdentity(idToken: string, nonce: string, keys: JWTVerifyGetKey = signingKeys) {
  if (!process.env.LINKEDIN_CLIENT_ID) throw new LinkedInOAuthError("linkedin_config");
  try {
    const { payload } = await jwtVerify(idToken, keys, {
      issuer, audience: process.env.LINKEDIN_CLIENT_ID, algorithms: ["RS256"],
      requiredClaims: ["iss", "aud", "exp", "iat", "sub"],
      maxTokenAge: "10m", clockTolerance: 5,
    });
    if (nonce && payload.nonce === undefined) throw new LinkedInOAuthError("linkedin_identity_nonce_missing");
    if ((nonce && payload.nonce !== nonce) || (!nonce && payload.nonce !== undefined)) throw new LinkedInOAuthError("linkedin_identity_nonce");
    if (!payload.sub) throw new LinkedInOAuthError("linkedin_identity");
    return payload.sub;
  } catch (error) {
    if (error instanceof LinkedInOAuthError) throw error;
    const claim = error instanceof Error && "claim" in error ? error.claim : null;
    if (claim === "nonce") throw new LinkedInOAuthError("linkedin_identity_nonce");
    if (claim === "iss") throw new LinkedInOAuthError("linkedin_identity_issuer");
    if (claim === "aud") throw new LinkedInOAuthError("linkedin_identity_audience");
    if (claim === "exp" || claim === "iat" || claim === "nbf") throw new LinkedInOAuthError("linkedin_identity_time");
    throw new LinkedInOAuthError("linkedin_identity");
  }
}

const tokenSchema = z.object({
  access_token: z.string().min(1).max(10000),
  id_token: z.string().min(1).max(20000),
  expires_in: z.number().int().positive().max(366 * 24 * 60 * 60),
  scope: z.string().min(1),
});

export async function exchangeLinkedInCode(code: string, redirectUri: string, nonce: string, keys: JWTVerifyGetKey = signingKeys) {
  if (!isLinkedInConfigured()) throw new LinkedInOAuthError("linkedin_config");
  const response = await checkedStage("linkedin_token_request", () => fetch(`${oauthOrigin}/oauth/v2/accessToken`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri,
      client_id: process.env.LINKEDIN_CLIENT_ID!, client_secret: process.env.LINKEDIN_CLIENT_SECRET! }),
    signal: AbortSignal.timeout(10000), cache: "no-store",
  }));
  if (!response.ok) throw new LinkedInOAuthError("linkedin_token_request");
  const tokens = await checkedStage("linkedin_token_response", async () => tokenSchema.parse(await response.json()));
  const scopes = tokens.scope.split(/[\s,]+/).filter(Boolean);
  if (!LINKEDIN_SCOPES.every((scope) => scopes.includes(scope))) throw new LinkedInOAuthError("linkedin_scope");
  const subject = await verifyLinkedInIdentity(tokens.id_token, nonce, keys);
  const identityResponse = await checkedStage("linkedin_profile_request", () => fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` }, signal: AbortSignal.timeout(10000), cache: "no-store",
  }));
  if (!identityResponse.ok) throw new LinkedInOAuthError("linkedin_profile_request");
  const identity = await checkedStage("linkedin_profile_response", async () => z.object({ sub: z.string().min(1), name: z.string().min(1).max(300) }).parse(await identityResponse.json()));
  if (identity.sub !== subject) throw new LinkedInOAuthError("linkedin_profile_subject");
  return {
    account: linkedInAccountSchema.parse({ token: tokens.access_token, subject, name: identity.name, scopes }),
    expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
  };
}