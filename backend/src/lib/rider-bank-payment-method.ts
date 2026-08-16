import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
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
  isActive: boolean;
  isPrimary: boolean;
  createdAt: string;
  rejectionReason?: string | null;
  /** Why status stays pending after provider verify (e.g. Aadhaar name mismatch). */
  pendingReason?: string | null;
  crossCheckStatus?: "ok" | "mismatch";
  crossCheckMessages?: string[];
};

/** Max bank-add attempts per rolling window (onboarding + earnings). */
export const RIDER_BANK_ADD_MAX_PER_WINDOW = 2;
export const RIDER_BANK_ADD_WINDOW_MS = 24 * 60 * 60 * 1000;

export type RiderBankAddGate = {
  locked: boolean;
  unlockAt: string | null;
  attemptsInWindow: number;
  rejectsInWindow: number;
  maxAttempts: number;
  windowHours: number;
};

export class RiderBankAddLockedError extends Error {
  readonly code = "BANK_ADD_LOCKED" as const;
  readonly unlockAt: string;
  readonly gate: RiderBankAddGate;

  constructor(gate: RiderBankAddGate) {
    super(
      "Bank account add is locked for security. Try again after the cooldown.",
    );
    this.name = "RiderBankAddLockedError";
    this.unlockAt = gate.unlockAt ?? new Date().toISOString();
    this.gate = gate;
  }
}

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

/** Stable hash for uniqueness — account number only (IFSC may repeat). */
export function riderBankAccountFingerprint(accountNumber: string): string {
  const digits = accountNumber.replace(/\D/g, "");
  return createHash("sha256").update(`rider-bank-acct:${digits}`).digest("hex");
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
  if (bankName.length < 1) return "Bank name is required";
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
    isActive: row.isActive !== false,
    isPrimary: row.isPrimary === true,
    createdAt: row.createdAt.toISOString(),
    rejectionReason:
      row.verificationStatus === "rejected"
        ? (row.rejectionReason?.trim() || null)
        : null,
    pendingReason:
      row.verificationStatus === "pending"
        ? (row.pendingReason?.trim() || null)
        : null,
    crossCheckStatus:
      row.crossCheckStatus === "ok" || row.crossCheckStatus === "mismatch"
        ? row.crossCheckStatus
        : undefined,
    crossCheckMessages: Array.isArray(row.crossCheckMessages)
      ? row.crossCheckMessages.map(String)
      : undefined,
  };
}

/** Rolling 24h bank-add gate (max 2 creates). Light: one indexed query. */
export async function getRiderBankAddGate(riderId: number): Promise<RiderBankAddGate> {
  const db = getDb();
  const since = new Date(Date.now() - RIDER_BANK_ADD_WINDOW_MS);
  const rows = await db
    .select({
      createdAt: riderPaymentMethods.createdAt,
      verificationStatus: riderPaymentMethods.verificationStatus,
    })
    .from(riderPaymentMethods)
    .where(
      and(
        eq(riderPaymentMethods.riderId, riderId),
        eq(riderPaymentMethods.methodType, "bank"),
        gte(riderPaymentMethods.createdAt, since),
      ),
    )
    .orderBy(riderPaymentMethods.createdAt);

  const attemptsInWindow = rows.length;
  const rejectsInWindow = rows.filter((r) => r.verificationStatus === "rejected").length;
  const locked = attemptsInWindow >= RIDER_BANK_ADD_MAX_PER_WINDOW;
  const unlockAt =
    locked && rows[0]
      ? new Date(rows[0].createdAt.getTime() + RIDER_BANK_ADD_WINDOW_MS).toISOString()
      : null;

  return {
    locked,
    unlockAt,
    attemptsInWindow,
    rejectsInWindow,
    maxAttempts: RIDER_BANK_ADD_MAX_PER_WINDOW,
    windowHours: 24,
  };
}

export async function assertRiderCanAddBank(riderId: number): Promise<RiderBankAddGate> {
  const gate = await getRiderBankAddGate(riderId);
  if (gate.locked) throw new RiderBankAddLockedError(gate);
  return gate;
}

/** Active primary bank, else latest active, else latest non-deleted (legacy). */
export async function getRiderBankPaymentMethod(
  riderId: number,
): Promise<RiderBankPaymentMethodView | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(riderPaymentMethods)
    .where(
      and(
        eq(riderPaymentMethods.riderId, riderId),
        eq(riderPaymentMethods.methodType, "bank"),
        isNull(riderPaymentMethods.deletedAt),
      ),
    )
    .orderBy(desc(riderPaymentMethods.isPrimary), desc(riderPaymentMethods.createdAt));

  if (rows.length === 0) return null;

  const primaryActive = rows.find((r) => r.isPrimary === true && r.isActive !== false);
  if (primaryActive) return toView(primaryActive);

  const active = rows.find((r) => r.isActive !== false);
  if (active) return toView(active);

  return toView(rows[0]!);
}

/** All non-deleted bank accounts (active + deactivated history). */
export async function listRiderBankPaymentMethods(
  riderId: number,
): Promise<RiderBankPaymentMethodView[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(riderPaymentMethods)
    .where(
      and(
        eq(riderPaymentMethods.riderId, riderId),
        eq(riderPaymentMethods.methodType, "bank"),
        isNull(riderPaymentMethods.deletedAt),
      ),
    )
    .orderBy(desc(riderPaymentMethods.isPrimary), desc(riderPaymentMethods.createdAt));

  return rows.map(toView);
}

async function deactivateOtherBankAccounts(riderId: number, exceptId?: number): Promise<void> {
  const db = getDb();
  // Soft-deactivate for payouts only — never delete / never clear rejected history.
  await db
    .update(riderPaymentMethods)
    .set({
      isActive: false,
      isPrimary: false,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(riderPaymentMethods.riderId, riderId),
        eq(riderPaymentMethods.methodType, "bank"),
        isNull(riderPaymentMethods.deletedAt),
        exceptId != null ? sql`${riderPaymentMethods.id} <> ${exceptId}` : sql`TRUE`,
      ),
    );
}

/** Returns existing row info if this account number is already on file for the rider. */
export async function findDuplicateRiderBankAccount(
  riderId: number,
  accountNumber: string,
): Promise<{ id: number; verificationStatus: string } | null> {
  const fingerprint = riderBankAccountFingerprint(accountNumber);
  const db = getDb();

  const [byFp] = await db
    .select({
      id: riderPaymentMethods.id,
      verificationStatus: riderPaymentMethods.verificationStatus,
    })
    .from(riderPaymentMethods)
    .where(
      and(
        eq(riderPaymentMethods.riderId, riderId),
        eq(riderPaymentMethods.methodType, "bank"),
        eq(riderPaymentMethods.accountNumberFingerprint, fingerprint),
      ),
    )
    .limit(1);

  if (byFp) return byFp;

  const legacy = await db
    .select({
      id: riderPaymentMethods.id,
      accountNumberEncrypted: riderPaymentMethods.accountNumberEncrypted,
      verificationStatus: riderPaymentMethods.verificationStatus,
    })
    .from(riderPaymentMethods)
    .where(
      and(
        eq(riderPaymentMethods.riderId, riderId),
        eq(riderPaymentMethods.methodType, "bank"),
        sql`${riderPaymentMethods.accountNumberFingerprint} IS NULL`,
      ),
    );

  const digits = accountNumber.replace(/\D/g, "");
  for (const row of legacy) {
    if (!row.accountNumberEncrypted) continue;
    const plain = decryptRiderAccountNumber(row.accountNumberEncrypted);
    if (!plain) continue;
    if (plain.replace(/\D/g, "") === digits) {
      return { id: row.id, verificationStatus: row.verificationStatus };
    }
  }
  return null;
}

export function duplicateBankAccountMessage(verificationStatus: string): string {
  return verificationStatus === "rejected"
    ? "This account number was already submitted and rejected. Add a different account number."
    : "This account number is already linked. Use a different account number.";
}

/** Block re-adding the same account number (rejected / inactive rows still count). */
async function assertAccountNumberNotUsed(
  riderId: number,
  accountNumber: string,
): Promise<void> {
  const dup = await findDuplicateRiderBankAccount(riderId, accountNumber);
  if (dup) throw new Error(duplicateBankAccountMessage(dup.verificationStatus));
}

/**
 * Add a new bank account as primary+active.
 * Previous accounts are deactivated (not deleted) so rejected/history remain visible.
 * Max 2 creates per rolling 24h window. Account number must be unique per rider.
 */
export async function createRiderBankPaymentMethod(
  riderId: number,
  input: RiderBankPaymentMethodInput,
): Promise<RiderBankPaymentMethodView> {
  const validationError = validateRiderBankPaymentMethodInput(input);
  if (validationError) {
    throw new Error(validationError);
  }

  await assertRiderCanAddBank(riderId);

  const accountHolderName = input.accountHolderName.trim();
  const bankName = input.bankName.trim();
  const ifsc = normalizeIfsc(input.ifsc);
  const branch = input.branch?.trim() || null;
  const accountNumber = input.accountNumber.replace(/\s/g, "");
  const fingerprint = riderBankAccountFingerprint(accountNumber);

  await assertAccountNumberNotUsed(riderId, accountNumber);

  let verificationStatus: "pending" | "verified" = "pending";
  let nameMismatchMessages: string[] | null = null;
  let crossCheckStatus: "ok" | "mismatch" | null = null;
  let pendingReason: string | null = null;
  try {
    const { loadRiderAadhaarIdentity } = await import("./rider-aadhaar-cross-check.js");
    const { crossCheckAgainstAadhaar } = await import("./rider-cross-document-match.js");
    const aadhaar = await loadRiderAadhaarIdentity(riderId);
    if (aadhaar.name.trim().length >= 2) {
      const cross = crossCheckAgainstAadhaar({
        docKind: "bank",
        aadhaar,
        extractedName: accountHolderName,
      });
      if (cross.ok) {
        verificationStatus = "verified";
        crossCheckStatus = "ok";
      } else {
        nameMismatchMessages = cross.messages;
        crossCheckStatus = "mismatch";
        pendingReason = [
          "Bank details verified by provider (Cashfree). Manual review required because account holder name does not match Aadhaar.",
          ...(cross.messages ?? []),
          `Aadhaar name: ${aadhaar.name.trim()}. Account holder: ${accountHolderName}.`,
        ].join(" ");
      }
    } else {
      pendingReason =
        "Bank details submitted. Aadhaar name unavailable for auto-match — awaiting manual verification.";
    }
  } catch {
    pendingReason =
      "Bank details submitted. Aadhaar cross-check unavailable — awaiting manual verification.";
  }

  await deactivateOtherBankAccounts(riderId);

  const db = getDb();
  let row: typeof riderPaymentMethods.$inferSelect | undefined;
  try {
    const inserted = await db
      .insert(riderPaymentMethods)
      .values({
        riderId,
        methodType: "bank",
        accountHolderName,
        bankName,
        ifsc,
        branch,
        accountNumberEncrypted: encryptRiderAccountNumber(accountNumber),
        accountNumberFingerprint: fingerprint,
        verificationStatus,
        verifiedAt: verificationStatus === "verified" ? new Date() : null,
        rejectionReason: null,
        crossCheckStatus,
        crossCheckMessages: nameMismatchMessages,
        pendingReason: verificationStatus === "pending" ? pendingReason : null,
        isActive: true,
        isPrimary: true,
        deletedAt: null,
      })
      .returning();
    row = inserted[0];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/rider_payment_methods_rider_acct_fp_uidx|unique/i.test(msg)) {
      throw new Error(
        "This account number is already linked. Use a different account number.",
      );
    }
    throw err;
  }

  if (!row) {
    throw new Error("Could not save bank account");
  }

  const view = toView(row);
  return {
    ...view,
    ...(nameMismatchMessages
      ? {
          crossCheckStatus: "mismatch" as const,
          crossCheckMessages: nameMismatchMessages,
        }
      : { crossCheckStatus: (crossCheckStatus ?? "ok") as "ok" | "mismatch" }),
  };
}

/** Set an existing (non-deleted) account as primary for payouts. Reactivates it. */
export async function setRiderBankPaymentMethodPrimary(
  riderId: number,
  paymentMethodId: number,
): Promise<RiderBankPaymentMethodView> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(riderPaymentMethods)
    .where(
      and(
        eq(riderPaymentMethods.id, paymentMethodId),
        eq(riderPaymentMethods.riderId, riderId),
        eq(riderPaymentMethods.methodType, "bank"),
        isNull(riderPaymentMethods.deletedAt),
      ),
    )
    .limit(1);

  if (!row) {
    throw new Error("Bank account not found");
  }

  if (row.verificationStatus === "rejected") {
    throw new Error("Rejected bank accounts cannot be set as primary. Add a new account.");
  }

  await deactivateOtherBankAccounts(riderId, paymentMethodId);

  const [updated] = await db
    .update(riderPaymentMethods)
    .set({
      isActive: true,
      isPrimary: true,
      updatedAt: new Date(),
    })
    .where(eq(riderPaymentMethods.id, paymentMethodId))
    .returning();

  if (!updated) {
    throw new Error("Could not set primary bank account");
  }

  return toView(updated);
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
