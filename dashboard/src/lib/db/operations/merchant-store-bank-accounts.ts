/**
 * Operations for merchant_store_bank_accounts.
 * store_id = merchant_stores.id (internal numeric id).
 */
import { getSql } from "../client";

export interface MerchantStoreBankAccountRow {
  id: number;
  store_id: number;
  account_holder_name: string;
  account_number: string;
  ifsc_code: string;
  bank_name: string;
  branch_name: string | null;
  account_type: string | null;
  is_verified: boolean | null;
  upi_id: string | null;
  upi_verified: boolean | null;
  is_primary: boolean | null;
  is_active: boolean | null;
  payout_method: string | null;
  verification_status: string | null;
  is_disabled: boolean;
  created_at: Date;
  updated_at: Date;
}

/** Mask account number to last 4 digits for display */
function maskAccountNumber(num: string | null | undefined): string {
  if (!num || typeof num !== "string") return "—";
  const s = num.replace(/\s/g, "");
  if (s.length <= 4) return "****";
  return "****" + s.slice(-4);
}

export interface BankAccountDisplay {
  id: number;
  account_holder_name: string;
  account_number_masked: string;
  account_number?: string;
  ifsc_code: string;
  bank_name: string;
  branch_name: string | null;
  account_type: string | null;
  is_verified: boolean;
  is_primary: boolean;
  is_active: boolean;
  upi_id: string | null;
  payout_method: string | null;
  verification_status: string | null;
}

/**
 * Fetch all active bank accounts for a store (merchant_stores.id).
 */
export async function getStoreBankAccounts(storeId: number): Promise<BankAccountDisplay[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT id, store_id, account_holder_name, account_number, ifsc_code, bank_name,
           branch_name, account_type, is_verified, upi_id, upi_verified, is_primary,
           is_active, payout_method, verification_status, is_disabled, created_at, updated_at
    FROM merchant_store_bank_accounts
    WHERE store_id = ${storeId}
      AND (is_disabled = false OR is_disabled IS NULL)
    ORDER BY is_primary DESC NULLS LAST, id ASC
  `;
  const list = Array.isArray(rows) ? rows : [rows];
  return list.map((r: any) => ({
    id: Number(r.id),
    account_holder_name: r.account_holder_name ?? "",
    account_number_masked: maskAccountNumber(r.account_number),
    ifsc_code: r.ifsc_code ?? "",
    bank_name: r.bank_name ?? "",
    branch_name: r.branch_name ?? null,
    account_type: r.account_type ?? null,
    is_verified: Boolean(r.is_verified),
    is_primary: Boolean(r.is_primary),
    is_active: r.is_active !== false,
    upi_id: r.upi_id ?? null,
    payout_method: r.payout_method ?? null,
    verification_status: r.verification_status ?? null,
  }));
}
