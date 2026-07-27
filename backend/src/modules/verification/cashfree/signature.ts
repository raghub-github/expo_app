/**
 * Cashfree Secure ID public-key 2FA signature.
 *
 * When IP whitelisting is not available (local / dynamic IP), Cashfree accepts
 * `x-cf-signature`: RSA-OAEP(SHA-1) encrypt of `clientId.unixTimestamp` using
 * the merchant public key from the Cashfree dashboard.
 *
 * @see https://www.cashfree.com/docs/api-reference/vrs/2fa-api-signature-generation
 */
import crypto from "node:crypto";

/** Normalize PEM or raw base64 (possibly multiline) into a usable public key. */
export function normalizeCashfreePublicKey(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.includes("BEGIN PUBLIC KEY")) {
    return trimmed;
  }
  const b64 = trimmed.replace(/\s+/g, "");
  const lines = b64.match(/.{1,64}/g) ?? [b64];
  return `-----BEGIN PUBLIC KEY-----\n${lines.join("\n")}\n-----END PUBLIC KEY-----`;
}

/**
 * Build `x-cf-signature` header value. Returns null if key missing/invalid
 * so callers can still attempt the request (IP-whitelist-only accounts).
 */
export function buildCashfreeCfSignature(
  clientId: string,
  publicKeyRaw: string | null | undefined,
): string | null {
  const id = String(clientId || "").trim();
  const keyRaw = String(publicKeyRaw || "").trim();
  if (!id || !keyRaw) return null;

  try {
    const pem = normalizeCashfreePublicKey(keyRaw);
    const payload = `${id}.${Math.floor(Date.now() / 1000)}`;
    const encrypted = crypto.publicEncrypt(
      {
        key: pem,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha1",
      },
      Buffer.from(payload, "utf8"),
    );
    return encrypted.toString("base64");
  } catch (e) {
    console.error(
      "[cashfree] failed to build x-cf-signature:",
      e instanceof Error ? e.message : e,
    );
    return null;
  }
}
