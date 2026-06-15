import { createDecipheriv, createHash } from "node:crypto";

function encryptionKey(): Buffer {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) return createHash("sha256").update("rider-bank:").digest();
  return createHash("sha256").update(`rider-bank:${secret}`).digest();
}

export function decryptRiderAccountNumber(payload: string): string | null {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  try {
    const iv = Buffer.from(parts[1], "base64url");
    const tag = Buffer.from(parts[2], "base64url");
    const encrypted = Buffer.from(parts[3], "base64url");
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function maskRiderAccountNumber(accountNumber: string): string {
  const digits = accountNumber.replace(/\D/g, "");
  if (digits.length <= 4) return "••••";
  return `•••• ${digits.slice(-4)}`;
}
