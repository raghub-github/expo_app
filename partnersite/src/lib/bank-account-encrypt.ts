/**
 * AES-256-GCM encryption for bank account_number at rest.
 * Requires env BANK_VERIFICATION_ENCRYPTION_KEY (32-byte hex, or 32-char string used as key).
 */

import crypto from "crypto";

const ALG = "aes-256-gcm";
const IV_LEN = 16;
const AUTH_TAG_LEN = 16;
const KEY_LEN = 32;

function getKey(): Buffer {
  const raw = process.env.BANK_VERIFICATION_ENCRYPTION_KEY;
  if (!raw || raw.length < 16) {
    throw new Error("BANK_VERIFICATION_ENCRYPTION_KEY must be set (32 chars or 64 hex chars)");
  }
  if (raw.length === 64 && /^[0-9a-fA-F]+$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  return crypto.createHash("sha256").update(raw.slice(0, 64)).digest();
}

/**
 * Encrypt account number for storage. Returns iv:authTag:ciphertext as base64.
 */
export function encryptAccountNumber(accountNumber: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALG, key, iv);
  const enc = Buffer.concat([
    cipher.update(accountNumber, "utf8"),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return Buffer.concat([iv, enc]).toString("base64");
}

/**
 * Decrypt account number from storage. Use only for re-verification or admin; never expose to client.
 */
export function decryptAccountNumber(encrypted: string | null | undefined): string {
  if (!encrypted || typeof encrypted !== "string") return "";
  try {
    const buf = Buffer.from(encrypted, "base64");
    if (buf.length < IV_LEN + AUTH_TAG_LEN) return "";
    const key = getKey();
    const iv = buf.subarray(0, IV_LEN);
    const authTag = buf.subarray(buf.length - AUTH_TAG_LEN);
    const data = buf.subarray(IV_LEN, buf.length - AUTH_TAG_LEN);
    const decipher = crypto.createDecipheriv(ALG, key, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(data) + decipher.final("utf8");
  } catch {
    return "";
  }
}

export function isEncryptionConfigured(): boolean {
  const raw = process.env.BANK_VERIFICATION_ENCRYPTION_KEY;
  return !!(raw && raw.length >= 16);
}
