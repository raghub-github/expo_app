/**
 * A slow or unreachable DB must never read as "not authorized" during login, and
 * nothing in the login path may sign out globally (which ended the admin's
 * sessions on every device and every site sharing the Supabase project).
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";

const here = new URL(".", import.meta.url);
const mod = (rel: string) => new URL(rel, here).href;

let strictLookup: () => Promise<unknown> = async () => null;
mock.module(mod("./user-mapping.ts"), {
  namedExports: {
    getSystemUserByEmailStrict: () => strictLookup(),
    getSystemUserByEmail: () => strictLookup(),
  },
});
let rolesQuery: () => Promise<unknown> = async () => [{ role_count: 1 }];
mock.module(mod("../db/client.ts"), {
  namedExports: { getSql: () => () => rolesQuery(), getDb: () => ({}) },
});
for (const rel of ["./client-session-storage.ts", "./hydrate-browser-supabase.ts"]) {
  mock.module(mod(rel), {
    namedExports: {
      clearStaleClientAuthStorage: () => undefined,
      readUsableClientSessionFromStorage: () => null,
      hydrateBrowserSupabaseFromCookies: async () => false,
      syncClientStorageFromServerSession: async () => undefined,
    },
  });
}
mock.module(mod("../utils.ts"), {
  namedExports: {
    safeParseJson: (text: string, fallback: unknown) => {
      try {
        return JSON.parse(text);
      } catch {
        return fallback;
      }
    },
  },
});

const { validateUserForLogin } = await import("./user-validation.ts");
const { postSetCookieWithTokens } = await import("./sync-server-session.ts");
const { signOutIfSessionDead } = await import("./session-errors.ts");

const ACTIVE = { id: 7, email: "a@x.in", status: "ACTIVE", primary_role: "" };

test("a failed user lookup is transient, not 'not registered'", async () => {
  strictLookup = async () => {
    throw new Error("Failed query: canceling statement due to statement timeout");
  };
  const r = await validateUserForLogin("a@x.in");
  assert.equal(r.isValid, false);
  assert.equal(r.transient, true);
});

test("a failed roles query is transient, not 'no roles'", async () => {
  strictLookup = async () => ACTIVE;
  rolesQuery = async () => {
    throw new Error("write CONNECTION_ENDED");
  };
  const r = await validateUserForLogin("a@x.in");
  assert.equal(r.isValid, false);
  assert.equal(r.transient, true);
});

test("a user who truly is not registered is a hard (non-transient) denial", async () => {
  strictLookup = async () => null;
  const r = await validateUserForLogin("a@x.in");
  assert.equal(r.isValid, false);
  assert.notEqual(r.transient, true);
});

test("a user with no roles is a hard denial", async () => {
  strictLookup = async () => ACTIVE;
  rolesQuery = async () => [{ role_count: 0 }];
  const r = await validateUserForLogin("a@x.in");
  assert.equal(r.isValid, false);
  assert.notEqual(r.transient, true);
});

function stubFetch(responses: Array<() => Response>) {
  let calls = 0;
  globalThis.fetch = (async () => {
    const make = responses[Math.min(calls, responses.length - 1)];
    calls++;
    return make();
  }) as typeof fetch;
  return () => calls;
}

test("nginx 504 on set-cookie is retried and reported transient (not 'not authorized')", async () => {
  const calls = stubFetch([() => new Response("<html>504 Gateway Time-out</html>", { status: 504 })]);
  const r = await postSetCookieWithTokens("a", "r");
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.transient, true);
  assert.doesNotMatch(!r.ok ? r.error : "", /504|html/i);
  assert.equal(calls(), 3);
});

test("a network failure on set-cookie is transient", async () => {
  globalThis.fetch = (async () => {
    throw new TypeError("Failed to fetch");
  }) as typeof fetch;
  const r = await postSetCookieWithTokens("a", "r");
  assert.equal(!r.ok && r.transient, true);
});

test("a real 403 from set-cookie is a rejection, not transient", async () => {
  const calls = stubFetch([
    () => new Response(JSON.stringify({ success: false, error: "not authorized" }), { status: 403 }),
  ]);
  const r = await postSetCookieWithTokens("a", "r");
  assert.equal(r.ok, false);
  assert.notEqual(!r.ok && r.transient, true);
  assert.equal(calls(), 1);
});

test("signOutIfSessionDead only ever signs out locally", async () => {
  const scopes: unknown[] = [];
  const supabase = {
    auth: {
      signOut: async (opts?: { scope?: string }) => {
        scopes.push(opts?.scope);
      },
    },
  };
  const did = await signOutIfSessionDead(supabase, { name: "AuthApiError", message: "Invalid Refresh Token: Refresh Token Revoked" });
  assert.equal(did, true);
  assert.deepEqual(scopes, ["local"]);
});
