import api from "./api";

const ME_PREFIX = "/v1/me";

export type WalletBalance = {
  balance: number;
  locked_amount: number;
  available_balance: number;
  currency: "INR";
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
};
