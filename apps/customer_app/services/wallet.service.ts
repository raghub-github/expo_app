import api from "./api";

const ME_PREFIX = "/v1/me";

export type WalletBalance = {
  balance: number;
  locked_amount: number;
  available_balance: number;
  currency: "INR";
};

export type WalletSettings = {
  auto_add_enabled: boolean;
  auto_add_amount: number;
  auto_add_threshold: number;
  monthly_topup_limit: number;
  monthly_topup_used: number;
  monthly_topup_remaining: number;
  max_wallet_balance: number;
  added_balance_expiry_years: number;
  linked_mobile_masked: string | null;
};

export type WalletPhoneChangeResult = {
  request_id: string;
  status: string;
  message: string;
};

export type WalletTransactionType =
  | "credit"
  | "debit"
  | "refund"
  | "expired"
  | "bonus"
  | "cashback"
  | "reversal";

export type WalletTransaction = {
  id: string;
  transaction_id: string;
  type: WalletTransactionType;
  title: string;
  description: string | null;
  amount: number;
  balance_after: number | null;
  reference_id: string | null;
  reference_type: string | null;
  status: string | null;
  created_at: string;
};

export type WalletTxFilter = "all" | "additions" | "deductions" | "refunds" | "expired";

export const walletService = {
  async getBalance(): Promise<WalletBalance> {
    const { data } = await api.get<WalletBalance>(`${ME_PREFIX}/wallet`);
    return data;
  },

  async getSettings(): Promise<WalletSettings> {
    const { data } = await api.get<WalletSettings>(`${ME_PREFIX}/wallet/settings`);
    return data;
  },

  async updateSettings(input: {
    auto_add_enabled?: boolean;
    auto_add_amount?: number;
    auto_add_threshold?: number;
  }): Promise<WalletSettings> {
    const { data } = await api.patch<WalletSettings>(`${ME_PREFIX}/wallet/settings`, input);
    return data;
  },

  async requestPhoneChange(newMobile: string): Promise<WalletPhoneChangeResult> {
    const { data } = await api.post<WalletPhoneChangeResult>(
      `${ME_PREFIX}/wallet/phone-change-request`,
      {
        new_mobile: newMobile,
        no_transfer_acknowledged: true as const,
      }
    );
    return data;
  },

  async getTransactions(params?: {
    filter?: WalletTxFilter;
    limit?: number;
    offset?: number;
  }): Promise<{ transactions: WalletTransaction[]; has_more: boolean }> {
    const { data } = await api.get<{ transactions: WalletTransaction[]; has_more: boolean }>(
      `${ME_PREFIX}/wallet/transactions`,
      { params }
    );
    return data;
  },

  async claimMissedOfferCompensation(input: {
    merchantId: string;
    amountInr: number;
    offerKey: string;
    offerId?: number | null;
    offerSource?: "platform" | "merchant" | null;
    offerKind?: string;
    offerTitle?: string;
  }): Promise<{ ok: true; amount_inr: number; balance_after: number; transaction_id: string }> {
    const { data } = await api.post<{
      ok: true;
      amount_inr: number;
      balance_after: number;
      transaction_id: string;
    }>(`${ME_PREFIX}/wallet/claim-missed-offer-compensation`, input);
    return data;
  },
};
