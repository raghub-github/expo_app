import { getConfig } from "@/config/env";
import { authFetch } from "@/services/authFetch";

const getBase = () => getConfig().apiBaseUrl;

export type BankAccount = {
  id: number;
  store_id: number;
  account_holder_name: string;
  account_number: string;
  ifsc_code: string;
  bank_name: string;
  branch_name: string | null;
  account_type: string | null;
  is_verified: boolean;
  verification_status: string | null;
  upi_id: string | null;
  upi_verified: boolean;
  is_primary: boolean;
  is_active: boolean;
  is_disabled: boolean;
  payout_method: string | null;
  beneficiary_name: string | null;
  created_at: string;
  updated_at: string;
} | null;

export type BankAccountPayload = {
  account_holder_name: string;
  account_number: string;
  ifsc_code: string;
  bank_name: string;
  branch_name?: string | null;
  account_type?: string | null;
  upi_id?: string | null;
  payout_method?: string | null;
  beneficiary_name?: string | null;
};

export async function getBankAccount(
  storeId: number,
  token: string
): Promise<BankAccount> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/bank-account`,
    token
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as any).error || res.statusText || "Failed to load bank account"
    );
  }
  const data = (await res.json()) as BankAccount;
  return data;
}

export async function upsertBankAccount(
  storeId: number,
  payload: BankAccountPayload,
  token: string
): Promise<void> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/bank-account`,
    token,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as any).error || res.statusText || "Failed to update bank account"
    );
  }
}

