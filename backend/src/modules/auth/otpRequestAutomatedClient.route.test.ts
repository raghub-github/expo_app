/**
 * Route-level: POST /v1/auth/otp/request must never start an SMS for Google
 * Play's automated testers or for dummy numbers, while a real rider on an Indian
 * ISP and an ARMED review number behave exactly as before.
 *
 * Evidence (prod nginx + backend logs, 2026-11-20 08:15–10:55 IST): ~30 OTP
 * requests from 66.249.x / 74.125.x (Google LLC, okhttp) for +91 99999 99999,
 * +91 91131 94305 and +91 65049 92804, each followed ~1 s later by Supabase's
 * Send SMS hook → MSG91. The app only calls Supabase when the backend answers
 * `useSupabase: true`; a `requestId` answer keeps it on the backend path.
 *
 * Nothing real is touched: env is a plain object, the MSG91 sender and the
 * per-phone guard are stubbed, and no request reaches a database.
 */
import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";

type Sent = { phone: string; otp: string };

async function buildApp(t: TestContext, envOver: Record<string, unknown> = {}) {
  const sent: Sent[] = [];
  const baseEnv: Record<string, unknown> = {
    NODE_ENV: "test",
    // Test-only signing key (never a real secret) — the auth plugin needs one at boot.
    SUPABASE_JWT_SECRET: "test-only-jwt-secret-for-otp-route-tests-0123456789",
    MSG91_OTP_EXPIRY_SEC: 300,
    GOOGLE_REVIEW_MODE: false,
    REVIEW_LOGIN_BYPASS_ENABLED: false,
    RIDER_REVIEW_LOGIN_BYPASS_ENABLED: false,
    ...envOver,
  };
  // Any key the routes read that the test does not set resolves to undefined.
  const env = new Proxy(baseEnv, { get: (o, k) => (o as Record<string | symbol, unknown>)[k] });
  t.mock.module("../../config/env.js", { namedExports: { getEnv: () => env } });
  t.mock.module("../../services/otp/msg91DeliverSupabaseOtp.js", {
    namedExports: {
      deliverSupabaseOtpViaMsg91: async (_env: unknown, phone: string, otp: string) => {
        sent.push({ phone, otp });
        return { ok: true };
      },
    },
  });
  const realGuard = await import("./otpSendGuard.js");
  t.mock.module("./otpSendGuard.js", {
    namedExports: {
      ...realGuard,
      checkAndRecordOtpSend: async () => ({ allowed: true }),
    },
  });
  const { authRoutes } = await import(`./auth.routes.js?v=${Math.random()}`);
  const app = Fastify({ logger: false });
  // Same compilers src/index.ts installs (never import src/index.ts: it loads backend/.env).
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(authRoutes, { prefix: "/v1/auth" });
  await app.ready();
  t.after(() => app.close());
  return { app, sent };
}

const otp = (app: Awaited<ReturnType<typeof buildApp>>["app"], body: object, ip: string) =>
  app.inject({
    method: "POST",
    url: "/v1/auth/otp/request",
    headers: { "content-type": "application/json", "x-real-ip": ip },
    payload: body,
  });

test("Google Play robot (66.249.x) on the rider app: requestId, no useSupabase, no SMS", async (t) => {
  const { app, sent } = await buildApp(t);
  const res = await otp(app, { phoneE164: "+919113194305", appType: "rider" }, "66.249.88.99");
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(typeof body.requestId === "string" && body.requestId.length > 0);
  assert.notEqual(body.useSupabase, true, "robot must not be told to call Supabase");
  assert.equal(sent.length, 0);
});

test("Google Play robot (74.125.x) on the customer app with supabaseHandoff: no Supabase, no SMS", async (t) => {
  const { app, sent } = await buildApp(t);
  const res = await otp(
    app,
    { phoneE164: "+916504992804", appType: "customer", supabaseHandoff: true },
    "74.125.210.39",
  );
  assert.equal(res.statusCode, 200);
  assert.notEqual(res.json().useSupabase, true);
  assert.ok(res.json().requestId);
  assert.equal(sent.length, 0);
});

test("a real rider on an Indian ISP still gets the Supabase handoff (unchanged)", async (t) => {
  const { app } = await buildApp(t);
  const res = await otp(app, { phoneE164: "+919113194305", appType: "rider" }, "223.184.208.143");
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().useSupabase, true);
  assert.equal(res.json().requestId, "");
});

test("dummy 99999 99999 is refused with a final 4xx (no SMS, no Supabase fallback)", async (t) => {
  const { app, sent } = await buildApp(t);
  const res = await otp(
    app,
    { phoneE164: "+919999999999", appType: "customer", supabaseHandoff: true },
    "223.184.208.143",
  );
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, "invalid_phone");
  assert.equal(sent.length, 0);
});

test("an ARMED review number still logs in from Google's network (bypass runs first)", async (t) => {
  const { app, sent } = await buildApp(t, {
    GOOGLE_REVIEW_MODE: true,
    GOOGLE_REVIEW_PHONE: "+919999999999",
    GOOGLE_REVIEW_OTP: "123456",
  });
  const res = await otp(
    app,
    { phoneE164: "+919999999999", appType: "customer", supabaseHandoff: true },
    "66.249.88.99",
  );
  assert.equal(res.statusCode, 200);
  assert.ok(res.json().requestId, "review path returns its fixed-OTP requestId");
  assert.equal(sent.length, 0);

  const verify = await app.inject({
    method: "POST",
    url: "/v1/auth/otp/verify",
    headers: { "content-type": "application/json", "x-real-ip": "66.249.88.99" },
    payload: { requestId: res.json().requestId, otp: "000000", phoneE164: "+919999999999", appType: "customer" },
  });
  // Wrong code is rejected; the point is the review session exists for this requestId.
  assert.notEqual(verify.statusCode, 200);
});

test("the switch turns the robot rule off", async (t) => {
  process.env.OTP_SUPPRESS_AUTOMATED_CLIENTS = "false";
  t.after(() => {
    delete process.env.OTP_SUPPRESS_AUTOMATED_CLIENTS;
  });
  const { app } = await buildApp(t);
  const res = await otp(app, { phoneE164: "+919113194305", appType: "rider" }, "66.249.88.99");
  assert.equal(res.json().useSupabase, true);
});
