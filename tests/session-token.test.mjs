import assert from "node:assert/strict";
import test from "node:test";
import { createSessionToken, getSessionCookieOptions, SESSION_MAX_AGE_SECONDS, verifySessionToken } from "../src/lib/session-token.ts";

const secret = "unit-test-session-secret";
const email = "dirigeant@example.invalid";

test("session token signs identity, version and bounded expiration", () => {
  const now = Date.now();
  const token = createSessionToken(email, 7, secret, now);
  const claims = verifySessionToken(token, secret, now);

  assert.equal(claims?.email, email);
  assert.equal(claims?.sessionVersion, 7);
  assert.equal(claims?.expiresAt - claims?.issuedAt, SESSION_MAX_AGE_SECONDS);
});

test("session token rejects tampering, another secret and expired cookies", () => {
  const now = Date.now();
  const token = createSessionToken(email, 0, secret, now);
  const changedFirstCharacter = token[0] === "a" ? "b" : "a";

  assert.equal(verifySessionToken(`${changedFirstCharacter}${token.slice(1)}`, secret, now), null);
  assert.equal(verifySessionToken(token, "another-secret", now), null);
  assert.equal(verifySessionToken(token, secret, now + (SESSION_MAX_AGE_SECONDS + 1) * 1000), null);
});

test("session cookie expires after the signed lifetime and is secure only in production", () => {
  const now = Date.now();
  const production = getSessionCookieOptions(now, "production");
  assert.equal(production.maxAge, SESSION_MAX_AGE_SECONDS);
  assert.equal(production.expires.getTime(), now + SESSION_MAX_AGE_SECONDS * 1000);
  assert.equal(production.secure, true);
  assert.equal(production.httpOnly, true);
  assert.equal(getSessionCookieOptions(now, "development").secure, false);
});