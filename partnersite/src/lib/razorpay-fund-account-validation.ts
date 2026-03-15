/**
 * Razorpay Fund Account Validation API (composite) – no money transfer.
 * Bank: validation_type "pennyiless". VPA: composite (no amount).
 * @see https://razorpay.com/docs/api/x/composite-account-validation/bank-account/
 * @see https://razorpay.com/docs/api/x/composite-account-validation/vpa/
 */

const RAZORPAY_BASE = "https://api.razorpay.com/v1";

export type ValidationResult = {
  id: string;
  status: "created" | "completed" | "failed";
  validation_results?: {
    account_status?: string | null;
    registered_name?: string | null;
  };
  fund_account?: {
    id: string;
    account_type: string;
    bank_account?: { name?: string; ifsc?: string; account_number?: string };
    vpa?: { address?: string };
  };
  status_details?: { description?: string; reason?: string };
};

/**
 * Create bank account validation (pennyiless = no transfer). Composite: contact + fund_account + validate in one call.
 */
export async function createBankValidation(params: {
  authHeader: string;
  sourceAccountNumber: string;
  accountHolderName: string;
  accountNumber: string;
  ifsc: string;
  contactEmail: string;
  contactPhone: string;
  referenceId: string;
}): Promise<{ success: true; data: ValidationResult } | { success: false; error: string }> {
  const res = await fetch(RAZORPAY_BASE + "/fund_accounts/validations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: params.authHeader,
    },
    body: JSON.stringify({
      source_account_number: params.sourceAccountNumber,
      validation_type: "pennyiless",
      reference_id: params.referenceId.slice(0, 40),
      notes: { store_ref: params.referenceId },
      fund_account: {
        account_type: "bank_account",
        bank_account: {
          name: params.accountHolderName.slice(0, 100),
          ifsc: params.ifsc.trim().slice(0, 11),
          account_number: String(params.accountNumber).replace(/\D/g, ""),
        },
        contact: {
          name: params.accountHolderName.slice(0, 100),
          email: params.contactEmail.slice(0, 255),
          contact: params.contactPhone.replace(/\D/g, "").slice(0, 15) || "0000000000",
          type: "vendor",
          reference_id: params.referenceId,
        },
      },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.description || data?.error || res.statusText || "Validation request failed";
    return { success: false, error: msg };
  }
  return { success: true, data: data as ValidationResult };
}

/**
 * Create VPA (UPI) validation – no amount, no transfer. Composite.
 */
export async function createVpaValidation(params: {
  authHeader: string;
  sourceAccountNumber: string;
  vpaAddress: string;
  holderName: string;
  contactEmail: string;
  contactPhone: string;
  referenceId: string;
}): Promise<{ success: true; data: ValidationResult } | { success: false; error: string }> {
  const res = await fetch(RAZORPAY_BASE + "/fund_accounts/validations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: params.authHeader,
    },
    body: JSON.stringify({
      source_account_number: params.sourceAccountNumber,
      reference_id: params.referenceId.slice(0, 40),
      notes: { store_ref: params.referenceId },
      fund_account: {
        account_type: "vpa",
        vpa: { address: params.vpaAddress.trim().toLowerCase() },
        contact: {
          name: (params.holderName || params.vpaAddress).slice(0, 100),
          email: params.contactEmail.slice(0, 255),
          contact: params.contactPhone.replace(/\D/g, "").slice(0, 15) || "0000000000",
          type: "vendor",
          reference_id: params.referenceId,
        },
      },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.description || data?.error || res.statusText || "VPA validation request failed";
    return { success: false, error: msg };
  }
  return { success: true, data: data as ValidationResult };
}

/**
 * Fetch validation result by id (poll until completed/failed or timeout).
 */
export async function fetchValidationById(
  authHeader: string,
  validationId: string
): Promise<{ success: true; data: ValidationResult } | { success: false; error: string }> {
  const res = await fetch(RAZORPAY_BASE + "/fund_accounts/validations/" + validationId, {
    headers: { Authorization: authHeader },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { success: false, error: data?.error?.description || "Failed to fetch validation" };
  }
  return { success: true, data: data as ValidationResult };
}

/**
 * Derive verified status and beneficiary name from validation result.
 */
export function parseValidationResult(data: ValidationResult): {
  verified: boolean;
  beneficiaryName: string | null;
  accountStatus: string | null;
} {
  const status = data.status;
  const results = data.validation_results;
  const accountStatus = results?.account_status ?? null;
  const registeredName = results?.registered_name ?? data.fund_account?.bank_account?.name ?? data.fund_account?.vpa?.address ?? null;
  const beneficiaryName = typeof registeredName === "string" ? registeredName.trim() || null : null;
  const verified = status === "completed" && accountStatus !== "invalid";
  return { verified: status === "completed" && accountStatus !== "invalid", beneficiaryName, accountStatus };
}
