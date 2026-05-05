import assert from "node:assert/strict";
import crypto from "node:crypto";
import { afterEach, describe, it } from "node:test";
import { verifyRazorpaySignature, verifyRazorpayWebhookSignature } from "./razorpayService.js";

const ORIGINAL_ENV = {
  NODE_ENV: process.env.NODE_ENV,
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,
  RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET,
};

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_ENV.NODE_ENV;
  process.env.RAZORPAY_KEY_SECRET = ORIGINAL_ENV.RAZORPAY_KEY_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = ORIGINAL_ENV.RAZORPAY_WEBHOOK_SECRET;
});

function seedBaseEnv() {
  if (!process.env.DATABASE_URL) process.env.DATABASE_URL = "postgres://user:password@localhost:5432/testdb";
  if (!process.env.SUPABASE_URL) process.env.SUPABASE_URL = "https://example.supabase.co";
  if (!process.env.SUPABASE_ANON_KEY) process.env.SUPABASE_ANON_KEY = "anon_key_1234567890";
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) process.env.SUPABASE_SERVICE_ROLE_KEY = "service_role_key_1234567890";
  if (!process.env.SUPABASE_JWT_SECRET) process.env.SUPABASE_JWT_SECRET = "jwt_secret_12345678901234567890";
  if (!process.env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_KEY_SECRET.length < 10) {
    process.env.RAZORPAY_KEY_SECRET = "test_secret_key_12345";
  }
}

describe("razorpay signature verification", () => {
  it("verifies checkout signatures using the order and payment ids", () => {
    seedBaseEnv();
    process.env.NODE_ENV = "test";
    process.env.RAZORPAY_KEY_SECRET = "test_secret_key_12345";

    const orderId = "order_123";
    const paymentId = "pay_456";
    const signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");

    assert.equal(verifyRazorpaySignature(orderId, paymentId, signature), true);
    assert.equal(verifyRazorpaySignature(orderId, paymentId, "bad_signature"), false);
  });

  it("verifies webhook signatures using the raw payload", () => {
    seedBaseEnv();
    process.env.NODE_ENV = "test";
    process.env.RAZORPAY_WEBHOOK_SECRET = "test_webhook_secret_12345";

    const payload = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: "pay_456", order_id: "order_123" } } },
    });
    const signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(payload)
      .digest("hex");

    assert.equal(verifyRazorpayWebhookSignature(payload, signature), true);
    assert.equal(verifyRazorpayWebhookSignature(payload, "bad_signature"), false);
  });
});
