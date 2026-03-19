import { getConfig } from "@/config/env";
import { authFetch } from "@/services/authFetch";

const getBase = () => getConfig().apiBaseUrl;

export type BankAccount = {
  id: number;
  store_id: number;
  account_holder_name: string;
  account_number: string;
  account_number_masked?: string | null;
  ifsc_code: string;
  bank_name: string;
  branch_name: string | null;
  account_type: string | null;
  is_verified: boolean;
  verification_status: string | null;
  upi_id: string | null;
  is_primary: boolean;
  is_active: boolean;
  is_disabled: boolean;
  payout_method: string | null;
  beneficiary_name: string | null;
  created_at: string;
  updated_at: string;
};

export type BankAccountPayload = {
  payout_method?: string;
  account_holder_name: string;
  account_number: string;
  ifsc_code?: string;
  bank_name?: string;
  branch_name?: string | null;
  account_type?: string | null;
  upi_id?: string | null;
  beneficiary_name?: string | null;
};

export async function listBankAccounts(
  storeId: number,
  token: string
): Promise<BankAccount[]> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/bank-accounts`,
    token
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || res.statusText || "Failed to load bank accounts");
  }
  const data = await res.json();
  return (data as any).accounts ?? [];
}

export async function addBankAccount(
  storeId: number,
  payload: BankAccountPayload,
  token: string
): Promise<BankAccount> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/bank-accounts`,
    token,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || res.statusText || "Failed to add bank account");
  }
  const data = await res.json();
  return (data as any).account;
}

export async function setAccountDefault(
  storeId: number,
  accountId: number,
  token: string
): Promise<void> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/bank-accounts/${accountId}`,
    token,
    {
      method: "PATCH",
      body: JSON.stringify({ set_default: true }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || "Failed to set default");
  }
}

export async function setAccountDisabled(
  storeId: number,
  accountId: number,
  disabled: boolean,
  token: string
): Promise<void> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/bank-accounts/${accountId}`,
    token,
    {
      method: "PATCH",
      body: JSON.stringify({ set_disabled: disabled }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || "Failed to update account status");
  }
}

/** @deprecated Use listBankAccounts instead. Kept for backward compatibility. */
export async function getBankAccount(
  storeId: number,
  token: string
): Promise<BankAccount | null> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/bank-account`,
    token
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || res.statusText || "Failed to load bank account");
  }
  const data = (await res.json()) as BankAccount | null;
  return data;
}

/** @deprecated Use addBankAccount instead. */
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
    throw new Error((err as any).error || res.statusText || "Failed to update bank account");
  }
}
