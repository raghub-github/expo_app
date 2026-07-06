/**
 * Cashfree webhook signature verification — BOTH schemes.
 *
 * Phase 2 §B established that Cashfree runs two coexisting schemes:
 *
 *   1. Header-signed  (DigiLocker, KYC Links, E-Sign, Video KYC)
 *        HMAC-SHA256 over (`x-webhook-timestamp` + raw body)
 *        Base64 in the `x-webhook-signature` header
 *
 *   2. Body-embedded  (BAV async, Reverse Penny Drop)
 *        HMAC-SHA256 over sorted-and-concatenated `data` object values
 *        Base64 in the JSON payload's top-level `signature` field
 *
 * Both use the merchant's client_secret as the HMAC key. Neither uses a
 * separate webhook secret — Cashfree's dashboard doesn't even offer one.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export type WebhookVerifyResult =
  | { ok: true }
  | { ok: false; reason: string };

const MAX_SKEW_MS = 5 * 60 * 1000;

// ── Scheme 1: header-signed ────────────────────────────────────────────────

export function verifyHeaderSigned(
  rawBody: string | Buffer,
  headers: {
    signature: string | string[] | undefined;
    timestamp: string | string[] | undefined;
  },
  clientSecret: string,
  nowMs: number = Date.now(),
): WebhookVerifyResult {
  const sig = firstHeader(headers.signature);
  const ts = firstHeader(headers.timestamp);
  if (!sig) return { ok: false, reason: "missing_signature_header" };
  if (!ts) return { ok: false, reason: "missing_timestamp_header" };

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || tsNum <= 0) return { ok: false, reason: "bad_timestamp" };
  const tsMs = tsNum < 1e12 ? tsNum * 1000 : tsNum;
  if (Math.abs(nowMs - tsMs) > MAX_SKEW_MS) return { ok: false, reason: "clock_skew" };

  const bodyBuf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, "utf8");
  const signed = Buffer.concat([Buffer.from(ts, "utf8"), bodyBuf]);
  const expected = createHmac("sha256", clientSecret).update(signed).digest("base64");

  return safeCompareBase64(expected, sig);
}

// ── Scheme 2: body-embedded (legacy BAV / RPD) ─────────────────────────────

/**
 * The legacy signing algorithm:
 *   1. Take the `data` object from the envelope.
 *   2. Extract its keys, sort alphabetically.
 *   3. Concatenate the stringified values in that order (no delimiter).
 *   4. HMAC-SHA256 that concatenation with the client secret.
 *   5. Base64. Compare with envelope.signature.
 *
 * Nested objects are JSON-stringified as-is. Nulls become the string "null".
 */
export function verifyBodyEmbedded(
  envelope: Record<string, unknown>,
  clientSecret: string,
): WebhookVerifyResult {
  const providedSig = typeof envelope["signature"] === "string" ? (envelope["signature"] as string) : null;
  if (!providedSig) return { ok: false, reason: "missing_signature_field" };

  const data = envelope["data"];
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, reason: "missing_data_object" };
  }

  const entries = Object.entries(data as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  const payload = entries.map(([, v]) => coerceForConcat(v)).join("");
  const expected = createHmac("sha256", clientSecret).update(payload).digest("base64");

  return safeCompareBase64(expected, providedSig);
}

function coerceForConcat(v: unknown): string {
  if (v == null) return "null";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  // Nested objects / arrays: JSON.stringify keeps a deterministic-enough form.
  return JSON.stringify(v);
}

// ── shared helpers ─────────────────────────────────────────────────────────

function firstHeader(v: string | string[] | undefined): string | null {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v[0] ?? null;
  return null;
}

function safeCompareBase64(expected: string, provided: string): WebhookVerifyResult {
  const a = safeBase64(expected);
  const b = safeBase64(provided);
  if (!a || !b) return { ok: false, reason: "bad_base64" };
  if (a.length !== b.length) return { ok: false, reason: "bad_signature" };
  if (!timingSafeEqual(a, b)) return { ok: false, reason: "bad_signature" };
  return { ok: true };
}

function safeBase64(s: string): Buffer | null {
  try { return Buffer.from(s, "base64"); } catch { return null; }
}
