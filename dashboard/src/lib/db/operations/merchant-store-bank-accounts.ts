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

function maskAccountNumber(num: string | null | undefined): string {
  if (!num || typeof num !== "string") return "—";
  const s = num.replace(/\s/g, "");
  if (s.length <= 4) return "****";
  return "****" + s.slice(-4);
}

export interface BankAccountDisplay {
  id: number;
  account_holder_name: string;
  beneficiary_name?: string | null;
  account_number_masked: string;
  account_number?: string;
  ifsc_code: string;
  bank_name: string;
  branch_name: string | null;
  account_type: string | null;
  is_verified: boolean;
  upi_verified?: boolean | null;
  is_primary: boolean;
  is_active: boolean;
  is_disabled: boolean;
  upi_id: string | null;
  payout_method: string | null;
  verification_status: string | null;
  bank_proof_file_url?: string | null;
  upi_qr_screenshot_url?: string | null;
}

function mapRow(r: any): BankAccountDisplay {
  return {
    id: Number(r.id),
    account_holder_name: r.account_holder_name ?? "",
    beneficiary_name: r.beneficiary_name ?? null,
    account_number_masked: maskAccountNumber(r.account_number),
    ifsc_code: r.ifsc_code ?? "",
    bank_name: r.bank_name ?? "",
    branch_name: r.branch_name ?? null,
    account_type: r.account_type ?? null,
    is_verified: Boolean(r.is_verified),
    upi_verified: r.upi_verified ?? null,
    is_primary: Boolean(r.is_primary),
    is_active: r.is_active !== false,
    is_disabled: Boolean(r.is_disabled),
    upi_id: r.upi_id ?? null,
    payout_method: r.payout_method ?? null,
    verification_status: r.verification_status ?? null,
    bank_proof_file_url: r.bank_proof_file_url ?? null,
    upi_qr_screenshot_url: r.upi_qr_screenshot_url ?? null,
  };
}

/**
 * Fetch ALL bank accounts for a store (including disabled).
 */
export async function getStoreBankAccounts(storeId: number): Promise<BankAccountDisplay[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT id, store_id, account_holder_name, beneficiary_name, account_number, ifsc_code, bank_name,
           branch_name, account_type, is_verified, upi_id, upi_verified, is_primary,
           is_active, payout_method, verification_status, is_disabled,
           bank_proof_file_url, upi_qr_screenshot_url,
           created_at, updated_at
    FROM merchant_store_bank_accounts
    WHERE store_id = ${storeId}
    ORDER BY is_primary DESC NULLS LAST, created_at DESC
  `;
  return (Array.isArray(rows) ? rows : [rows]).map(mapRow);
}

export async function updateStoreBankAccount(
  storeId: number,
  accountId: number,
  patch: Partial<{
    account_holder_name: string;
    beneficiary_name: string | null;
    account_number: string;
    ifsc_code: string;
    bank_name: string;
    branch_name: string | null;
    account_type: string | null;
    upi_id: string | null;
    payout_method: string | null;
    bank_proof_file_url: string | null;
    upi_qr_screenshot_url: string | null;
    is_verified: boolean | null;
    upi_verified: boolean | null;
    verification_status: string | null;
  }>
): Promise<BankAccountDisplay | null> {
  const sql = getSql();
  const p = patch ?? {};
  const [row] = await sql`
    UPDATE merchant_store_bank_accounts
    SET
      account_holder_name = COALESCE(${p.account_holder_name ?? null}, account_holder_name),
      beneficiary_name = COALESCE(${p.beneficiary_name ?? null}, beneficiary_name),
      account_number = COALESCE(${p.account_number ?? null}, account_number),
      ifsc_code = COALESCE(${p.ifsc_code ?? null}, ifsc_code),
      bank_name = COALESCE(${p.bank_name ?? null}, bank_name),
      branch_name = COALESCE(${p.branch_name ?? null}, branch_name),
      account_type = COALESCE(${p.account_type ?? null}, account_type),
      upi_id = COALESCE(${p.upi_id ?? null}, upi_id),
      payout_method = COALESCE(${p.payout_method ?? null}, payout_method),
      bank_proof_file_url = COALESCE(${p.bank_proof_file_url ?? null}, bank_proof_file_url),
      upi_qr_screenshot_url = COALESCE(${p.upi_qr_screenshot_url ?? null}, upi_qr_screenshot_url),
      is_verified = COALESCE(${p.is_verified ?? null}, is_verified),
      upi_verified = COALESCE(${p.upi_verified ?? null}, upi_verified),
      verification_status = COALESCE(${p.verification_status ?? null}, verification_status),
      updated_at = NOW()
    WHERE store_id = ${storeId}
      AND id = ${accountId}
    RETURNING *
  `;
  if (!row) return null;
  return mapRow(row);
}

export async function addStoreBankAccount(
  storeId: number,
  data: {
    payout_method: string;
    account_holder_name: string;
    account_number: string;
    ifsc_code: string;
    bank_name: string;
    branch_name?: string | null;
    account_type?: string | null;
    upi_id?: string | null;
    beneficiary_name?: string | null;
  }
): Promise<BankAccountDisplay> {
  const sql = getSql();
  const countRows = await sql`SELECT COUNT(*)::int AS cnt FROM merchant_store_bank_accounts WHERE store_id = ${storeId}`;
  const isFirst = ((countRows[0] as any)?.cnt ?? 0) === 0;

  const [row] = await sql`
    INSERT INTO merchant_store_bank_accounts (
      store_id, payout_method, account_holder_name, account_number,
      ifsc_code, bank_name, branch_name, account_type, upi_id, beneficiary_name,
      is_primary, is_active, is_disabled, verification_status
    ) VALUES (
      ${storeId}, ${data.payout_method}, ${data.account_holder_name}, ${data.account_number},
      ${data.ifsc_code}, ${data.bank_name}, ${data.branch_name ?? null}, ${data.account_type ?? null},
      ${data.upi_id ?? null}, ${data.beneficiary_name ?? data.account_holder_name},
      ${isFirst}, true, false, 'pending'
    ) RETURNING *
  `;
  return mapRow(row);
}

export async function setBankAccountDefault(storeId: number, accountId: number): Promise<void> {
  const sql = getSql();
  await sql`UPDATE merchant_store_bank_accounts SET is_primary = false, updated_at = NOW() WHERE store_id = ${storeId} AND id != ${accountId}`;
  await sql`UPDATE merchant_store_bank_accounts SET is_primary = true, is_active = true, is_disabled = false, updated_at = NOW() WHERE id = ${accountId} AND store_id = ${storeId}`;
}

export async function setBankAccountDisabled(storeId: number, accountId: number, disabled: boolean): Promise<void> {
  const sql = getSql();
  if (disabled) {
    await sql`UPDATE merchant_store_bank_accounts SET is_active = false, is_disabled = true, is_primary = false, updated_at = NOW() WHERE id = ${accountId} AND store_id = ${storeId}`;
  } else {
    await sql`UPDATE merchant_store_bank_accounts SET is_active = true, is_disabled = false, updated_at = NOW() WHERE id = ${accountId} AND store_id = ${storeId}`;
  }
}
