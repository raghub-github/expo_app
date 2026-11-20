/**
 * Proves stop-on-first-success: tryAllChannels cannot multiply billable submissions.
 * Run: node --import tsx --test src/services/otp/msg91DeliverSupabaseOtp.stopOnFirst.test.ts
 */
import assert from "node:assert/strict";
import { test, mock, before, after } from "node:test";

const calls: string[] = [];

before(() => {
  mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/v5/flow")) {
      calls.push("flow");
      return new Response(JSON.stringify({ type: "success", message: "ok-flow" }), { status: 200 });
    }
    if (url.includes("/api/v5/otp")) {
      calls.push("v5_otp");
      return new Response(JSON.stringify({ type: "success", message: "ok-v5" }), { status: 200 });
    }
    if (url.includes("sendotp.php")) {
      calls.push("legacy");
      return new Response(JSON.stringify({ type: "success", message: "ok-legacy" }), { status: 200 });
    }
    if (url.includes("/api/v2/sendsms")) {
      calls.push("v2");
      return new Response(JSON.stringify({ type: "success", message: "ok-v2" }), { status: 200 });
    }
    calls.push("other");
    return new Response("{}", { status: 500 });
  });
});

after(() => {
  mock.restoreAll();
});

test("preferLegacyOtpApi stops after first successful channel (single billable submit)", async () => {
  calls.length = 0;
  const { deliverSupabaseOtpViaMsg91 } = await import("./msg91DeliverSupabaseOtp.js");
  const result = await deliverSupabaseOtpViaMsg91(
    {
      MSG91_AUTH_KEY: "test-key-not-real",
      MSG91_TEMPLATE_ID: "aaaaaaaaaaaaaaaaaaaaaaaa",
      MSG91_FLOW_ID: "bbbbbbbbbbbbbbbbbbbbbbbb",
      MSG91_SENDER_ID: "GMMSMS",
      MSG91_OTP_VAR_NAME: "OTP",
      MSG91_OTP_EXPIRY_SEC: 300,
      NODE_ENV: "test",
    } as never,
    "+919876543210",
    "123456",
    { preferLegacyOtpApi: true, tryAllChannels: true },
  );
  assert.equal(result.ok, true);
  // Flow succeeds first in preferLegacy order — must not continue to legacy/v2.
  assert.deepEqual(calls, ["flow"]);
});

test("default order also stops after first success", async () => {
  calls.length = 0;
  const { deliverSupabaseOtpViaMsg91 } = await import("./msg91DeliverSupabaseOtp.js");
  const result = await deliverSupabaseOtpViaMsg91(
    {
      MSG91_AUTH_KEY: "test-key-not-real",
      MSG91_TEMPLATE_ID: "aaaaaaaaaaaaaaaaaaaaaaaa",
      MSG91_FLOW_ID: "bbbbbbbbbbbbbbbbbbbbbbbb",
      MSG91_SENDER_ID: "GMMSMS",
      MSG91_OTP_VAR_NAME: "OTP",
      MSG91_OTP_EXPIRY_SEC: 300,
      NODE_ENV: "test",
    } as never,
    "9876543210",
    "654321",
    { tryAllChannels: true },
  );
  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["v5_otp"]);
});
