import { baseApi } from "./baseApi";

export interface WalletSummary {
  available_balance: number;
  pending_balance: number;
  today_earning: number;
  yesterday_earning: number;
  total_earned: number;
  total_withdrawn: number;
  pending_withdrawal_total: number;
}

export interface LedgerFilters {
  storeId: string;
  limit: number;
  offset: number;
  from?: string;
  to?: string;
  direction?: "CREDIT" | "DEBIT";
  category?: string;
  search?: string;
}

export interface LedgerEntry {
  id: number;
  direction: "CREDIT" | "DEBIT";
  category: string;
  balance_type: string;
  amount: number;
  balance_after: number;
  reference_type: string;
  reference_id: number | null;
  reference_extra: string | null;
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  order_id: number | null;
  formatted_order_id: string | null;
  table_id: string | null;
}

export interface LedgerResponse {
  success: boolean;
  entries: LedgerEntry[];
  total: number;
}

export interface BankAccount {
  id: number;
  account_holder_name: string;
  account_number_masked: string | null;
  ifsc_code: string;
  bank_name: string;
  upi_id: string | null;
  is_primary: boolean;
  is_active: boolean;
  is_disabled: boolean;
  payout_method: string;
}

export interface OrderDetailItem {
  id: number;
  item_name: string;
  item_title: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  item_type: string | null;
}

export interface OrderDetailRider {
  id: number;
  rider_id: number;
  rider_name: string | null;
  rider_mobile: string | null;
  assignment_status: string;
  assigned_at: string | null;
  accepted_at: string | null;
}

export interface OrderDetailsResponse {
  success: boolean;
  items: OrderDetailItem[];
  riders: OrderDetailRider[];
}

export interface PayoutQuoteRequest {
  storeId: string;
  amount: number;
}

export interface PayoutQuoteResponse {
  success: boolean;
  requested_amount: number;
  commission_percentage: number;
  commission_amount: number;
  gst_on_commission_percent: number;
  gst_on_commission: number;
  tds_amount: number;
  tax_amount: number;
  net_payout_amount: number;
}

export interface PayoutDetails {
  payout: {
    id: number;
    amount: number;
    net_payout_amount: number;
    commission_percentage: number;
    commission_amount: number;
    status: string;
    utr_reference: string | null;
    requested_at: string;
  };
  bank: {
    account_holder_name: string;
    account_number_masked: string | null;
    bank_name: string;
    payout_method: string;
    upi_id: string | null;
    ifsc_code?: string | null;
  } | null;
}

export interface PayoutDetailsResponse {
  success: boolean;
  payout: PayoutDetails["payout"] | null;
  bank: PayoutDetails["bank"] | null;
}

export interface WalletRequestRow {
  id: number;
  wallet_id: number;
  merchant_store_id: number;
  store_code: string | null;
  store_name: string | null;
  direction: "CREDIT" | "DEBIT";
  amount: number;
  reason: string;
  category: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  requested_by_email: string | null;
  requested_by_name: string | null;
  requested_at: string;
  reviewed_by_email: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  order_id: number | null;
}

export interface WalletRequestsListResponse {
  success: boolean;
  requests: WalletRequestRow[];
  total: number;
  limit: number;
  offset: number;
}

export interface WalletRequestsSummaryResponse {
  success: boolean;
  counts: Record<string, number>;
  total: number;
}

export interface WalletRequestsFilters {
  storeId: string;
  status?: string;
  direction?: "CREDIT" | "DEBIT";
  search?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export const merchantStoreApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getStoreWallet: build.query<WalletSummary, string>({
      query: (storeId) => `/merchant/stores/${storeId}/wallet`,
      transformResponse: (raw: any): WalletSummary => {
        const src = raw?.data ?? raw;
        return {
          available_balance: Number(src?.available_balance ?? 0),
          pending_balance: Number(src?.pending_balance ?? 0),
          today_earning: Number(src?.today_earning ?? 0),
          yesterday_earning: Number(src?.yesterday_earning ?? 0),
          total_earned: Number(src?.total_earned ?? 0),
          total_withdrawn: Number(src?.total_withdrawn ?? 0),
          pending_withdrawal_total: Number(src?.pending_withdrawal_total ?? 0),
        };
      },
      providesTags: (result, _error, storeId) =>
        result ? [{ type: "Payment" as const, id: `WALLET-${storeId}` }] : [],
    }),

    getStoreLedger: build.query<LedgerResponse, LedgerFilters>({
      query: ({ storeId, ...filters }) => {
        const params = new URLSearchParams();
        params.set("limit", String(filters.limit));
        params.set("offset", String(filters.offset));
        if (filters.from) params.set("from", filters.from);
        if (filters.to) params.set("to", filters.to);
        if (filters.direction) params.set("direction", filters.direction);
        if (filters.category) params.set("category", filters.category);
        if (filters.search) params.set("search", filters.search);
        return `/merchant/stores/${storeId}/ledger?${params.toString()}`;
      },
      providesTags: (result, _error, { storeId }) =>
        result ? [{ type: "Payment" as const, id: `LEDGER-${storeId}` }] : [],
    }),

    getBankAccounts: build.query<BankAccount[], string>({
      query: (storeId) => `/merchant/stores/${storeId}/bank-accounts`,
      transformResponse: (raw: any): BankAccount[] => {
        if (Array.isArray(raw)) return raw;
        if (raw?.success && Array.isArray(raw.accounts)) return raw.accounts;
        if (raw?.success && Array.isArray(raw.data)) return raw.data;
        return [];
      },
      providesTags: (result, _error, storeId) =>
        (result ?? []).length > 0
          ? [{ type: "Payment" as const, id: `BANKS-${storeId}` }]
          : [],
    }),

    getPayoutQuote: build.query<PayoutQuoteResponse, PayoutQuoteRequest>({
      query: ({ storeId, amount }) =>
        `/merchant/stores/${storeId}/payout-quote?amount=${amount}`,
    }),

    getOrderDetails: build.query<
      OrderDetailsResponse,
      { storeId: string; orderId: number }
    >({
      query: ({ storeId, orderId }) =>
        `/merchant/stores/${storeId}/order-details?orderId=${orderId}`,
    }),

    getPayoutDetails: build.query<
      PayoutDetailsResponse,
      { storeId: string; payoutRequestId: number }
    >({
      query: ({ storeId, payoutRequestId }) =>
        `/merchant/stores/${storeId}/payout-request/${payoutRequestId}`,
    }),

    createPayoutRequest: build.mutation<
      { success: boolean; error?: string },
      { storeId: string; amount: number; bank_account_id: number }
    >({
      query: ({ storeId, ...body }) => ({
        url: `/merchant/stores/${storeId}/payout-request`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_result, _error, { storeId }) => [
        { type: "Payment" as const, id: `WALLET-${storeId}` },
        { type: "Payment" as const, id: `LEDGER-${storeId}` },
      ],
    }),

    getWalletRequests: build.query<WalletRequestsListResponse, WalletRequestsFilters>({
      query: ({ storeId, ...filters }) => {
        const params = new URLSearchParams();
        if (filters.status) params.set("status", filters.status);
        if (filters.direction) params.set("direction", filters.direction);
        if (filters.search) params.set("search", filters.search);
        if (filters.from) params.set("from", filters.from);
        if (filters.to) params.set("to", filters.to);
        params.set("limit", String(filters.limit ?? 50));
        params.set("offset", String(filters.offset ?? 0));
        return `/merchant/stores/${storeId}/wallet-requests?${params.toString()}`;
      },
      providesTags: (result, _error, { storeId }) =>
        result ? [{ type: "Payment" as const, id: `WALLET-REQUESTS-${storeId}` }] : [],
    }),

    getWalletRequestsSummary: build.query<WalletRequestsSummaryResponse, string>({
      query: (storeId) => `/merchant/stores/${storeId}/wallet-requests/summary`,
      providesTags: (result, _error, storeId) =>
        result ? [{ type: "Payment" as const, id: `WALLET-REQUESTS-SUMMARY-${storeId}` }] : [],
    }),

    createWalletRequest: build.mutation<
      { success: boolean; request?: WalletRequestRow; error?: string },
      { storeId: string; direction: "CREDIT" | "DEBIT"; amount: number; reason: string; order_id?: number }
    >({
      query: ({ storeId, ...body }) => ({
        url: `/merchant/stores/${storeId}/wallet-requests`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_result, _error, { storeId }) => [
        { type: "Payment" as const, id: `WALLET-REQUESTS-${storeId}` },
        { type: "Payment" as const, id: `WALLET-REQUESTS-SUMMARY-${storeId}` },
        { type: "Payment" as const, id: `WALLET-${storeId}` },
      ],
    }),

    updateWalletRequestStatus: build.mutation<
      { success: boolean; status?: string; error?: string },
      { storeId: string; requestId: number; action: "APPROVE" | "REJECT"; review_note?: string }
    >({
      query: ({ storeId, requestId, ...body }) => ({
        url: `/merchant/stores/${storeId}/wallet-requests/${requestId}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: (_result, _error, { storeId }) => [
        { type: "Payment" as const, id: `WALLET-REQUESTS-${storeId}` },
        { type: "Payment" as const, id: `WALLET-REQUESTS-SUMMARY-${storeId}` },
        { type: "Payment" as const, id: `WALLET-${storeId}` },
        { type: "Payment" as const, id: `LEDGER-${storeId}` },
      ],
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetStoreWalletQuery,
  useGetStoreLedgerQuery,
  useGetBankAccountsQuery,
  useLazyGetPayoutQuoteQuery,
  useGetOrderDetailsQuery,
  useGetPayoutDetailsQuery,
  useCreatePayoutRequestMutation,
  useGetWalletRequestsQuery,
  useGetWalletRequestsSummaryQuery,
  useCreateWalletRequestMutation,
  useUpdateWalletRequestStatusMutation,
} = merchantStoreApi;

