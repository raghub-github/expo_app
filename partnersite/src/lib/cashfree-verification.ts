/**
 * Cashfree Verification Suite client for merchant bank / UPI verification.
 *
 * Replaces the RazorpayX contact → fund-account → ₹1 payout flow (removed per
 * policy: Razorpay must never verify docs, bank accounts or UPI IDs — see
 * backend/drizzle/0396_verification_remove_razorpay.sql). Cashfree BAV is
 * pennyless and synchronous: one POST returns VALID/INVALID plus the name at
 * the bank, so there is no payout to poll afterwards.
 *
 * Auth mirrors backend/src/modules/verification/cashfree/provider.ts:
 * x-client-id / x-client-secret headers (+ optional x-api-version).
 *
 * Env (same names the backend uses):
 *   CASHFREE_BASE_URL      e.g. https://api.cashfree.com/verification
 *                          (sandbox: https://sandbox.cashfree.com/verification)
 *   CASHFREE_CLIENT_ID
 *   CASHFREE_CLIENT_SECRET
 *   CASHFREE_API_VERSION   optional
 */

const DEFAULT_TIMEOUT_MS = 20_000;

export type CashfreeConfigStatus =
  | { ok: true; baseUrl: string; clientId: string; clientSecret: string; apiVersion: string | null }
  | { ok: false; missing: string[] };

export function getCashfreeConfig(): CashfreeConfigStatus {
  const baseUrl = (process.env.CASHFREE_BASE_URL || "").trim().replace(/\/+$/, "");
  const clientId = (process.env.CASHFREE_CLIENT_ID || "").trim();
  const clientSecret = (process.env.CASHFREE_CLIENT_SECRET || "").trim();
  const missing: string[] = [];
  if (!baseUrl) missing.push("CASHFREE_BASE_URL");
  if (!clientId) missing.push("CASHFREE_CLIENT_ID");
  if (!clientSecret) missing.push("CASHFREE_CLIENT_SECRET");
  if (missing.length > 0) return { ok: false, missing };
  return {
    ok: true,
    baseUrl,
    clientId,
    clientSecret,
    apiVersion: (process.env.CASHFREE_API_VERSION || "").trim() || null,
  };
}

type CashfreeCall = {
  httpStatus: number;
  body: Record<string, unknown>;
};

async function cashfreePost(path: string, payload: Record<string, unknown>): Promise<CashfreeCall> {
  const cfg = getCashfreeConfig();
  if (!cfg.ok) {
    throw new Error(`Cashfree verification not configured (missing ${cfg.missing.join(", ")})`);
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-client-id": cfg.clientId,
    "x-client-secret": cfg.clientSecret,
  };
  if (cfg.apiVersion) headers["x-api-version"] = cfg.apiVersion;

  const res = await fetch(cfg.baseUrl + path, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { httpStatus: res.status, body };
}

export type BankVerifyResult = {
  /** 'verified' | 'invalid' | 'error' */
  outcome: "verified" | "invalid" | "error";
  /** Cashfree reference id for audit. */
  referenceId: string | null;
  /** Name registered at the bank / UPI app, when the provider returns it. */
  nameAtBank: string | null;
  bankName: string | null;
  /** Cashfree status code, e.g. VALID / INVALID / account_status_code. */
  statusCode: string | null;
  /** Human-readable failure reason for logs / support. */
  failureReason: string | null;
  raw: Record<string, unknown>;
};

/**
 * Pennyless bank account verification — POST /bank-account/sync.
 * Result is final in the same response (no polling).
 */
export async function verifyBankAccountSync(args: {
  accountNumber: string;
  ifsc: string;
  name: string;
  phone?: string | null;
  verificationId: string;
}): Promise<BankVerifyResult> {
  const payload: Record<string, unknown> = {
    verification_id: args.verificationId.slice(0, 50),
    bank_account: args.accountNumber.replace(/\D/g, ""),
    ifsc: args.ifsc.trim().toUpperCase().slice(0, 11),
    name: args.name.trim().slice(0, 100),
  };
  if (args.phone) payload.phone = args.phone.replace(/\D/g, "").slice(-10);

  try {
    const call = await cashfreePost("/bank-account/sync", payload);
    const b = call.body;
    const accountStatus = typeof b.account_status === "string" ? b.account_status : null;
    const referenceId = b.reference_id != null ? String(b.reference_id) : null;
    if (call.httpStatus >= 200 && call.httpStatus < 300 && accountStatus) {
      return {
        outcome: accountStatus === "VALID" ? "verified" : "invalid",
        referenceId,
        nameAtBank: typeof b.name_at_bank === "string" ? b.name_at_bank : null,
        bankName: typeof b.bank_name === "string" ? b.bank_name : null,
        statusCode: typeof b.account_status_code === "string" ? b.account_status_code : accountStatus,
        failureReason:
          accountStatus === "VALID"
            ? null
            : `account_status=${accountStatus} code=${String(b.account_status_code ?? "")}`,
        raw: b,
      };
    }
    return {
      outcome: "error",
      referenceId,
      nameAtBank: null,
      bankName: null,
      statusCode: typeof b.code === "string" ? b.code : String(call.httpStatus),
      failureReason:
        (typeof b.message === "string" && b.message) || `Cashfree HTTP ${call.httpStatus}`,
      raw: b,
    };
  } catch (e) {
    return {
      outcome: "error",
      referenceId: null,
      nameAtBank: null,
      bankName: null,
      statusCode: "network_error",
      failureReason: e instanceof Error ? e.message : "Cashfree request failed",
      raw: {},
    };
  }
}

function parseUpiVerifyBody(
  call: CashfreeCall,
): BankVerifyResult {
  const b = call.body;
  const referenceId = b.reference_id != null ? String(b.reference_id) : null;
  const statusUp = typeof b.status === "string" ? b.status.toUpperCase() : "";
  // /upi → account_exists YES/NO; /upi/penny-drop → status VALID/INVALID/SUCCESS
  const exists =
    (typeof b.account_exists === "string" && b.account_exists.toUpperCase() === "YES") ||
    statusUp === "VALID" ||
    statusUp === "SUCCESS";
  const invalid =
    (typeof b.account_exists === "string" && b.account_exists.toUpperCase() === "NO") ||
    ["INVALID", "FAILED", "EXPIRED"].includes(statusUp);
  const nameAtBank =
    (typeof b.name_at_bank === "string" && b.name_at_bank) ||
    (typeof b.customer_name === "string" && b.customer_name) ||
    null;
  const ifscDetails =
    b.ifsc_details && typeof b.ifsc_details === "object"
      ? (b.ifsc_details as Record<string, unknown>)
      : null;
  const bankName =
    (typeof ifscDetails?.bank === "string" && ifscDetails.bank) ||
    (typeof b.bank_name === "string" && b.bank_name) ||
    null;

  if (call.httpStatus >= 200 && call.httpStatus < 300 && (exists || invalid)) {
    return {
      outcome: exists ? "verified" : "invalid",
      referenceId,
      nameAtBank,
      bankName,
      statusCode: exists ? "VALID" : "INVALID",
      failureReason: exists ? null : "UPI ID does not exist or is inactive.",
      raw: b,
    };
  }
  return {
    outcome: "error",
    referenceId,
    nameAtBank: null,
    bankName: null,
    statusCode: typeof b.code === "string" ? b.code : String(call.httpStatus),
    failureReason:
      (typeof b.message === "string" && b.message) || `Cashfree HTTP ${call.httpStatus}`,
    raw: b,
  };
}

/**
 * UPI VPA verification. Uses Cashfree UPI Penny Drop (POST /upi/penny-drop);
 * falls back to lightweight POST /upi if penny-drop is not enabled.
 */
export async function verifyUpiSync(args: {
  vpa: string;
  name?: string | null;
  verificationId: string;
}): Promise<BankVerifyResult> {
  const payload: Record<string, unknown> = {
    verification_id: args.verificationId.slice(0, 50),
    vpa: args.vpa.trim().toLowerCase(),
  };
  if (args.name) payload.name = args.name.trim().slice(0, 100);

  try {
    let call = await cashfreePost("/upi/penny-drop", {
      ...payload,
      user_consent: {
        obtained: true,
        type: "EXPLICIT",
        timestamp: new Date().toISOString(),
        purpose: "Merchant store payout UPI ID verification",
      },
    });
    const msg = typeof call.body.message === "string" ? call.body.message : "";
    if (call.httpStatus >= 400 && /not enabled/i.test(msg)) {
      console.warn(
        "[cashfree] POST /upi/penny-drop not enabled — falling back to /upi",
      );
      call = await cashfreePost("/upi", payload);
    }

    return parseUpiVerifyBody(call);
  } catch (e) {
    return {
      outcome: "error",
      referenceId: null,
      nameAtBank: null,
      bankName: null,
      statusCode: "network_error",
      failureReason: e instanceof Error ? e.message : "Cashfree request failed",
      raw: {},
    };
  }
}
