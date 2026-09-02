/**
 * Session-isolation guard (control-dashboard account-switching incident).
 *
 * The authenticated identity of a request MUST derive only from THAT request's
 * own auth cookie — deterministically, with no dependence on any prior request's
 * state. The account-switching bug came from a process-global "last resolved
 * user" cache that could hand one admin's identity to another admin's request.
 * These tests pin the per-request cookie parser as the sole, isolated source.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readCookieAccessSession,
  hasSupabaseAuthCookies,
  isCookieAccessTokenUsable,
} from "./read-cookie-access-session.ts";

function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function fakeJwt(sub: string, email: string, expSecFromNow = 3600): string {
  const exp = Math.floor(Date.now() / 1000) + expSecFromNow;
  return [
    b64url({ alg: "HS256", typ: "JWT" }),
    b64url({ sub, email, exp, aud: "authenticated", role: "authenticated" }),
    "unverifiedsignature",
  ].join(".");
}

/** A realistic Supabase JSON auth cookie for one admin. */
function cookieStoreFor(sub: string, email: string, expSecFromNow = 3600) {
  const jwt = fakeJwt(sub, email, expSecFromNow);
  const value = JSON.stringify({
    access_token: jwt,
    refresh_token: `rt-${sub}`,
    expires_at: Math.floor(Date.now() / 1000) + expSecFromNow,
    user: { id: sub, email },
  });
  const cookies = new Map<string, string>([["sb-projref01-auth-token", value]]);
  return {
    get: (name: string) => {
      const v = cookies.get(name);
      return v != null ? { value: v } : undefined;
    },
    getAll: () => Array.from(cookies, ([name, value]) => ({ name, value })),
  };
}

test("each request's cookie resolves ONLY that request's admin identity", () => {
  const a = readCookieAccessSession(cookieStoreFor("admin-A-uuid", "a@gatimitra.com"));
  const b = readCookieAccessSession(cookieStoreFor("admin-B-uuid", "b@gatimitra.com"));
  assert.equal(a?.user.id, "admin-A-uuid");
  assert.equal(a?.user.email, "a@gatimitra.com");
  assert.equal(b?.user.id, "admin-B-uuid");
  assert.equal(b?.user.email, "b@gatimitra.com");
});

test("resolving B right after A never inherits A (no shared state between reads)", () => {
  // Interleave many reads in the two admins' order — each must stay isolated.
  for (let i = 0; i < 50; i++) {
    const a = readCookieAccessSession(cookieStoreFor("admin-A-uuid", "a@gatimitra.com"));
    const b = readCookieAccessSession(cookieStoreFor("admin-B-uuid", "b@gatimitra.com"));
    assert.equal(a?.user.id, "admin-A-uuid", `iter ${i}: A leaked`);
    assert.equal(b?.user.id, "admin-B-uuid", `iter ${i}: B leaked`);
    assert.notEqual(a?.user.id, b?.user.id);
  }
});

test("no auth cookie → no identity (never falls back to another admin)", () => {
  const empty = {
    get: () => undefined,
    getAll: () => [] as Array<{ name: string; value: string }>,
  };
  assert.equal(readCookieAccessSession(empty), null);
  assert.equal(hasSupabaseAuthCookies(empty), false);
});

test("hasSupabaseAuthCookies detects a present auth cookie", () => {
  assert.equal(hasSupabaseAuthCookies(cookieStoreFor("admin-A-uuid", "a@gatimitra.com")), true);
});

test("expired access token is reported unusable (forces a real refresh, not a cached identity)", () => {
  const expired = readCookieAccessSession(cookieStoreFor("admin-A-uuid", "a@gatimitra.com", -120));
  assert.equal(expired?.user.id, "admin-A-uuid");
  assert.equal(isCookieAccessTokenUsable(expired), false);
  const fresh = readCookieAccessSession(cookieStoreFor("admin-A-uuid", "a@gatimitra.com", 3600));
  assert.equal(isCookieAccessTokenUsable(fresh), true);
});
