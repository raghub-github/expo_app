import "server-only";

import { createHash, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { getSql, withPgRetry } from "@/lib/db/client";
import { sendEmail } from "@/lib/email/send";
import { assertWalletCreditWithinLimit, getCustomerWalletLimits } from "@/lib/db/wallet";

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

let ensured: Promise<void> | null = null;

function walletOtpEmail(): string {
  const email = (process.env.COREDASH_WALLET_OTP_EMAIL || "bhimpratap08@gmail.com").trim().toLowerCase();
  if (!email.includes("@")) throw new Error("COREDASH_WALLET_OTP_EMAIL is invalid");
  return email;
}

function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!user || !domain) return "***";
  const head = user.slice(0, Math.min(2, user.length));
  return `${head}***@${domain}`;
}

function hashOtp(otp: string, challengeId: string): string {
  return createHash("sha256").update(`${challengeId}:${otp}`).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export function ensureWalletOtpTable(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      const sql = getSql();
      await withPgRetry(
        () => sql`
          CREATE TABLE IF NOT EXISTS coredash_wallet_otp_challenges (
            id TEXT PRIMARY KEY,
            customer_key TEXT NOT NULL,
            admin_system_user_id BIGINT NOT NULL,
            amount NUMERIC(12, 2) NOT NULL,
            comment TEXT NOT NULL,
            otp_hash TEXT NOT NULL,
            email TEXT NOT NULL,
            attempts INT NOT NULL DEFAULT 0,
            expires_at TIMESTAMPTZ NOT NULL,
            consumed_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `,
        "ensure-wallet-otp-table"
      );
      await withPgRetry(
        () => sql`
          CREATE INDEX IF NOT EXISTS coredash_wallet_otp_expires_idx
          ON coredash_wallet_otp_challenges (expires_at)
        `,
        "ensure-wallet-otp-idx"
      );
    })().catch((err) => {
      ensured = null;
      throw err;
    });
  }
  return ensured;
}

export async function requestWalletCreditOtp(opts: {
  customerKey: string;
  amount: number;
  comment: string;
  adminSystemUserId: number;
  adminEmail?: string | null;
  customerName?: string | null;
}): Promise<{
  challengeId: string;
  requestId: string;
  emailMasked: string;
  expiresInSec: number;
}> {
  const amount = Number(opts.amount);
  const comment = String(opts.comment ?? "").trim();
  const customerKey = String(opts.customerKey ?? "").trim();
  const requestedBy = String(opts.adminEmail ?? "").trim().toLowerCase() || "unknown";

  if (!customerKey) throw new Error("Invalid customer id");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be greater than 0");
  if (!comment) throw new Error("Ledger comment is required");
  if (comment.length > 200) throw new Error("Comment must be 200 characters or less");

  // Validate room under max balance BEFORE creating OTP / sending email.
  const limits = await getCustomerWalletLimits(customerKey);
  assertWalletCreditWithinLimit(amount, limits);

  await ensureWalletOtpTable();
  const email = walletOtpEmail();
  const challengeId = randomBytes(24).toString("hex");
  const requestId = `CDW-${challengeId.slice(0, 8).toUpperCase()}`;
  const otp = String(randomInt(100000, 999999));
  const otpHash = hashOtp(otp, challengeId);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  const sql = getSql();

  await withPgRetry(
    () => sql`
      INSERT INTO coredash_wallet_otp_challenges (
        id, customer_key, admin_system_user_id, amount, comment, otp_hash, email, expires_at
      ) VALUES (
        ${challengeId},
        ${customerKey},
        ${opts.adminSystemUserId},
        ${amount},
        ${comment},
        ${otpHash},
        ${email},
        ${expiresAt.toISOString()}
      )
    `,
    "wallet-otp-insert"
  );

  const amountLabel = amount.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  });
  const who = opts.customerName?.trim() || customerKey;
  const esc = (v: string) =>
    v
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const text = [
    `GatiMitra CoreDash wallet credit OTP`,
    ``,
    `Request ID: ${requestId}`,
    `Requested by: ${requestedBy}`,
    `Customer: ${who}`,
    `Amount: ${amountLabel}`,
    `Ledger: ${comment}`,
    ``,
    `OTP: ${otp}`,
    ``,
    `Valid for 10 minutes. Do not share this code.`,
  ].join("\n");

  const sent = await sendEmail({
    to: email,
    subject: `Wallet credit OTP · ${requestId} · ${amountLabel}`,
    text,
    html: `
      <div style="font-family:Segoe UI,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111827">
        <h2 style="margin:0 0 8px;font-size:18px">Wallet credit verification</h2>
        <p style="margin:0 0 16px;color:#6B7280;font-size:14px">Confirm this CoreDash GatiCash credit.</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px">
          <tr><td style="padding:6px 0;color:#6B7280">Request ID</td><td style="padding:6px 0;text-align:right;font-weight:600;font-family:ui-monospace,Consolas,monospace">${esc(requestId)}</td></tr>
          <tr><td style="padding:6px 0;color:#6B7280">Requested by</td><td style="padding:6px 0;text-align:right;font-weight:600">${esc(requestedBy)}</td></tr>
          <tr><td style="padding:6px 0;color:#6B7280">Customer</td><td style="padding:6px 0;text-align:right;font-weight:600">${esc(who)}</td></tr>
          <tr><td style="padding:6px 0;color:#6B7280">Amount</td><td style="padding:6px 0;text-align:right;font-weight:600">${esc(amountLabel)}</td></tr>
          <tr><td style="padding:6px 0;color:#6B7280">Ledger</td><td style="padding:6px 0;text-align:right;font-weight:600">${esc(comment)}</td></tr>
        </table>
        <div style="background:#F3F4F6;border-radius:12px;padding:16px;text-align:center">
          <div style="letter-spacing:6px;font-size:28px;font-weight:700">${otp}</div>
          <div style="margin-top:8px;font-size:12px;color:#6B7280">Valid for 10 minutes</div>
        </div>
      </div>
    `,
  });

  if (!sent.ok) {
    await withPgRetry(
      () => sql`DELETE FROM coredash_wallet_otp_challenges WHERE id = ${challengeId}`,
      "wallet-otp-cleanup-failed-send"
    ).catch(() => undefined);
    if (sent.code === "NOT_CONFIGURED") {
      throw new Error("Email is not configured. Set EMAIL_ID + EMAIL_APP_PASSWORD in Coredash .env.local");
    }
    throw new Error("Failed to send OTP email");
  }

  return {
    challengeId,
    requestId,
    emailMasked: maskEmail(email),
    expiresInSec: Math.floor(OTP_TTL_MS / 1000),
  };
}

export type VerifiedWalletOtpChallenge = {
  challengeId: string;
  customerKey: string;
  amount: number;
  comment: string;
  adminSystemUserId: number;
};

/** Consume a valid OTP challenge. Throws on failure. */
export async function consumeWalletCreditOtp(opts: {
  challengeId: string;
  otp: string;
  customerKey: string;
  adminSystemUserId: number;
}): Promise<VerifiedWalletOtpChallenge> {
  const challengeId = String(opts.challengeId ?? "").trim();
  const otp = String(opts.otp ?? "").trim();
  const customerKey = String(opts.customerKey ?? "").trim();

  if (!challengeId) throw new Error("OTP challenge required");
  if (!/^\d{6}$/.test(otp)) throw new Error("Enter the 6-digit OTP");

  await ensureWalletOtpTable();
  const sql = getSql();

  const rows = await withPgRetry(
    () =>
      sql<
        {
          id: string;
          customer_key: string;
          admin_system_user_id: number;
          amount: string | number;
          comment: string;
          otp_hash: string;
          attempts: number;
          expires_at: Date | string;
          consumed_at: Date | string | null;
        }[]
      >`
        SELECT id, customer_key, admin_system_user_id, amount, comment, otp_hash, attempts, expires_at, consumed_at
        FROM coredash_wallet_otp_challenges
        WHERE id = ${challengeId}
        LIMIT 1
      `,
    "wallet-otp-load"
  );

  const row = rows[0];
  if (!row) throw new Error("OTP challenge not found. Request a new code.");
  if (row.consumed_at) throw new Error("OTP already used. Request a new code.");
  if (Number(row.admin_system_user_id) !== opts.adminSystemUserId) {
    throw new Error("OTP challenge does not match this session");
  }
  if (String(row.customer_key) !== customerKey) {
    throw new Error("OTP challenge does not match this customer");
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    throw new Error("OTP expired. Request a new code.");
  }
  if (Number(row.attempts) >= MAX_ATTEMPTS) {
    throw new Error("Too many incorrect OTP attempts. Request a new code.");
  }

  const expected = String(row.otp_hash);
  const actual = hashOtp(otp, challengeId);
  if (!safeEqualHex(expected, actual)) {
    await withPgRetry(
      () => sql`
        UPDATE coredash_wallet_otp_challenges
        SET attempts = attempts + 1
        WHERE id = ${challengeId}
      `,
      "wallet-otp-bump-attempts"
    );
    throw new Error("Incorrect OTP");
  }

  const consumed = await withPgRetry(
    () =>
      sql<{ id: string }[]>`
        UPDATE coredash_wallet_otp_challenges
        SET consumed_at = NOW()
        WHERE id = ${challengeId}
          AND consumed_at IS NULL
          AND expires_at > NOW()
        RETURNING id
      `,
    "wallet-otp-consume"
  );
  if (!consumed[0]) throw new Error("OTP already used or expired");

  return {
    challengeId,
    customerKey: String(row.customer_key),
    amount: Number(row.amount),
    comment: String(row.comment),
    adminSystemUserId: Number(row.admin_system_user_id),
  };
}
