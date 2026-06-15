import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { riderPaymentMethods } from "../db/schema.js";
import { getEnv } from "../config/env.js";

export type RiderBankPaymentMethodInput = {
  accountHolderName: string;
  bankName: string;
  ifsc: string;
  branch?: string | null;
  accountNumber: string;
};

export type RiderBankPaymentMethodView = {
  id: number;
  methodType: "bank";
  accountHolderName: string;
  bankName: string | null;
  ifsc: string | null;
  branch: string | null;
  accountNumberMasked: string;
  verificationStatus: "pending" | "verified" | "rejected";
  createdAt: string;
};

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/i;
const ACCOUNT_RE = /^\d{9,18}$/;

function encryptionKey(): Buffer {
  return createHash("sha256")
    .update(`rider-bank:${getEnv().SUPABASE_JWT_SECRET}`)
    .digest();
}

export function encryptRiderAccountNumber(accountNumber: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(accountNumber, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
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

export function normalizeIfsc(value: string): string {
  return value.trim().toUpperCase();
}

export function validateRiderBankPaymentMethodInput(
  input: RiderBankPaymentMethodInput,
): string | null {
  const accountHolderName = input.accountHolderName.trim();
  const bankName = input.bankName.trim();
  const ifsc = normalizeIfsc(input.ifsc);
  const accountNumber = input.accountNumber.replace(/\s/g, "");

  if (accountHolderName.length < 2) return "Account holder name is required";
  if (bankName.length < 2) return "Bank name is required";
  if (!IFSC_RE.test(ifsc)) return "Enter a valid IFSC code";
  if (!ACCOUNT_RE.test(accountNumber)) return "Enter a valid account number (9–18 digits)";

  return null;
}

function toView(row: typeof riderPaymentMethods.$inferSelect): RiderBankPaymentMethodView {
  const decrypted = row.accountNumberEncrypted
    ? decryptRiderAccountNumber(row.accountNumberEncrypted)
    : null;

  return {
    id: row.id,
    methodType: "bank",
    accountHolderName: row.accountHolderName,
    bankName: row.bankName ?? null,
    ifsc: row.ifsc ?? null,
    branch: row.branch ?? null,
    accountNumberMasked: decrypted ? maskRiderAccountNumber(decrypted) : "••••",
    verificationStatus: row.verificationStatus,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getRiderBankPaymentMethod(
  riderId: number,
): Promise<RiderBankPaymentMethodView | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(riderPaymentMethods)
    .where(
      and(
        eq(riderPaymentMethods.riderId, riderId),
        eq(riderPaymentMethods.methodType, "bank"),
        isNull(riderPaymentMethods.deletedAt),
      ),
    )
    .orderBy(desc(riderPaymentMethods.createdAt))
    .limit(1);

  return row ? toView(row) : null;
}

export async function createRiderBankPaymentMethod(
  riderId: number,
  input: RiderBankPaymentMethodInput,
): Promise<RiderBankPaymentMethodView> {
  const validationError = validateRiderBankPaymentMethodInput(input);
  if (validationError) {
    throw new Error(validationError);
  }

  const existing = await getRiderBankPaymentMethod(riderId);
  if (existing) {
    if (existing.verificationStatus === "rejected") {
      const db = getDb();
      await db
        .update(riderPaymentMethods)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(riderPaymentMethods.id, existing.id));
    } else {
      throw new Error("Bank account already linked");
    }
  }

  const accountHolderName = input.accountHolderName.trim();
  const bankName = input.bankName.trim();
  const ifsc = normalizeIfsc(input.ifsc);
  const branch = input.branch?.trim() || null;
  const accountNumber = input.accountNumber.replace(/\s/g, "");

  const db = getDb();
  const [row] = await db
    .insert(riderPaymentMethods)
    .values({
      riderId,
      methodType: "bank",
      accountHolderName,
      bankName,
      ifsc,
      branch,
      accountNumberEncrypted: encryptRiderAccountNumber(accountNumber),
      verificationStatus: "pending",
    })
    .returning();

  if (!row) {
    throw new Error("Could not save bank account");
  }

  return toView(row);
}

export async function riderHasBankPaymentMethod(riderId: number): Promise<boolean> {
  return (await getRiderBankPaymentMethod(riderId)) != null;
}

export async function safeRiderHasBankPaymentMethod(riderId: number): Promise<boolean> {
  try {
    return await riderHasBankPaymentMethod(riderId);
  } catch {
    return false;
  }
}
