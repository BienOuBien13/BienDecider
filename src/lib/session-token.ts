import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type SessionClaims = {
  email: string;
  sessionVersion: number;
  issuedAt: number;
  expiresAt: number;
};

export function getSessionCookieOptions(now: number, nodeEnv: string | undefined) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
    expires: new Date(now + SESSION_MAX_AGE_SECONDS * 1000),
    secure: nodeEnv === "production",
  };
}

export function createSessionToken(
  email: string,
  sessionVersion: number,
  secret: string,
  now = Date.now(),
): string {
  const issuedAt = Math.floor(now / 1000);
  const payload = Buffer.from(JSON.stringify({
    email,
    sessionVersion,
    issuedAt,
    expiresAt: issuedAt + SESSION_MAX_AGE_SECONDS,
  })).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifySessionToken(
  token: string,
  secret: string,
  now = Date.now(),
): SessionClaims | null {
  if (token.length > 2048) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;

  const expected = Buffer.from(createHmac("sha256", secret).update(payload).digest("base64url"));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;

  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (typeof claims !== "object" || claims === null) return null;
  const value = claims as Partial<SessionClaims>;
  const nowSeconds = Math.floor(now / 1000);
  if (
    typeof value.email !== "string" || !value.email ||
    !Number.isSafeInteger(value.sessionVersion) || value.sessionVersion! < 0 ||
    !Number.isSafeInteger(value.issuedAt) || value.issuedAt! > nowSeconds + 60 ||
    !Number.isSafeInteger(value.expiresAt) || value.expiresAt! <= nowSeconds ||
    value.expiresAt! <= value.issuedAt! ||
    value.expiresAt! - value.issuedAt! > SESSION_MAX_AGE_SECONDS
  ) return null;

  return value as SessionClaims;
}