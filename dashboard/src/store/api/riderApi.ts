import { baseApi } from "./baseApi";

// Core rider types derived from existing rider APIs
export interface RiderCore {
  id: number;
  name: string | null;
  mobile: string;
  /** Dial code; optional when API omits it */
  countryCode?: string | null;
  dob?: string | null;
  aadhaarNumber: string | null;
  panNumber: string | null;
  onboardingStage: string;
  kycStatus: string;
  status: string;
  city: string | null;
  state: string | null;
  pincode: string | null;
  address: string | null;
  referralCode?: string | null;
  referredBy?: number | null;
  defaultLanguage?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RiderWalletInfo {
  totalBalance: string;
  globalWalletBlock?: boolean;
  earningsFood: string;
  earningsParcel: string;
  earningsPersonRide: string;
  penaltiesFood: string;
  penaltiesParcel: string;
  penaltiesPersonRide: string;
  totalWithdrawn: string;
  lastUpdatedAt: string | null;
}

export interface RiderLedgerEntry {
  id: number;
  riderId: number;
  entryType: string;
  amount: string;
  balance: string | null;
  serviceType: string | null;
  ref?: string | null;
  refType?: string | null;
  description: string | null;
  orderId?: string | null;
  performedByType?: string;
  performedById?: number | null;
  performedByEmail?: string | null;
  performedByName?: string | null;
  createdAt: string;
}

export interface RiderPenalty {
  id: number;
  orderId: number | null;
  serviceType: string | null;
  penaltyType: string;
  amount: string;
  reason: string | null;
  status: string;
  imposedAt: string | null;
  resolvedAt: string | null;
  source?: string;
  resolutionNotes?: string | null;
}

export interface RiderWithdrawalEntry {
  id: number;
  amount: string;
  status: string;
  bankAcc: string;
  ifsc: string;
  accountHolderName: string;
  transactionId: string | null;
  processedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RiderDocumentFile {
  id: number;
  fileUrl: string;
  side?: string;
  sortOrder?: number;
}

export interface RiderDocument {
  id: number;
  docType: string;
  fileUrl: string;
  docNumber?: string | null;
  verificationMethod?: string;
  verificationStatus?: string;
  expiryDate?: string | null;
  verified: boolean;
  verifiedAt?: string | null;
  verifierName?: string | null;
  rejectedReason?: string | null;
  createdAt: string;
  files?: RiderDocumentFile[];
}

export interface RiderAddress {
  id: number;
  fullAddress: string;
  addressType: string;
  isPrimary: boolean;
  state: string | null;
  pincode: string | null;
}

export interface RiderVehicle {
  id: number;
  vehicleType: string;
  registrationNumber: string;
  registrationState?: string | null;
  make: string | null;
  model: string | null;
  year?: number | null;
  color?: string | null;
  fuelType: string | null;
  vehicleCategory?: string | null;
  acType?: string | null;
  isCommercial?: boolean;
  permitExpiry?: string | null;
  insuranceExpiry?: string | null;
  vehicleActiveStatus?: string;
  seatingCapacity?: number | null;
  serviceTypes?: string[];
  verified?: boolean;
  verifiedAt?: string | null;
  isActive?: boolean;
}

export interface RiderPaymentMethod {
  id: number;
  methodType: string;
  accountHolderName: string;
  bankName?: string | null;
  ifsc?: string | null;
  branch?: string | null;
  accountNumberMasked?: string | null;
  upiId?: string | null;
  verificationStatus: string;
  verificationProofType?: string | null;
  verifiedAt?: string | null;
  createdAt: string;
}

export interface RiderOnboardingPaymentEntry {
  id: number;
  riderId: number;
  amount: string;
  provider: string;
  refId: string;
  paymentId: string | null;
  status: string;
  createdAt: string;
}

export interface RiderDetailsResponse {
  rider: RiderCore;
  documents: RiderDocument[];
  addresses: RiderAddress[];
  vehicle: RiderVehicle | null;
  paymentMethods: RiderPaymentMethod[];
  wallet: RiderWalletInfo | null;
  recentLedger: RiderLedgerEntry[];
  recentPenalties: RiderPenalty[];
  recentWithdrawals: RiderWithdrawalEntry[];
  onboardingPayments: RiderOnboardingPaymentEntry[];
}

export interface RiderLedgerFilters {
  limit?: number;
  offset?: number;
  from?: string;
  to?: string;
  flow?: "credit" | "debit" | "all";
  entryType?: string;
  serviceType?: string;
  q?: string;
}

export interface RiderLedgerResponse {
  ledger: RiderLedgerEntry[];
  total: number;
}

export interface RiderPenaltiesFilters {
  limit?: number;
  offset?: number;
  from?: string;
  to?: string;
  serviceType?: string;
  status?: string;
  q?: string;
}

export interface RiderPenaltiesResponse {
  penalties: RiderPenalty[];
  total: number;
}

export interface AddRiderPenaltyRequest {
  amount: number;
  reason: string;
  serviceType?: string | null;
  penaltyType?: string;
  orderId?: number;
}

export interface RiderOrdersFilters {
  limit?: number;
  offset?: number;
  orderType?: string;
  status?: string;
  from?: string;
  to?: string;
  q?: string;
}

export interface RiderOrderRow {
  id: number;
  orderType: string;
  status: string;
  fareAmount: string | null;
  riderEarning: string | null;
  createdAt: string;
  externalRef: string | null;
}

export interface RiderOrdersResponse {
  orders: RiderOrderRow[];
  total: number;
}

export interface WalletCreditRequestRow {
  id: number;
  riderId: number;
  orderId?: number | null;
  serviceType?: string | null;
  amount: string;
  status: string;
}

export const riderApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getRiderDetails: build.query<RiderDetailsResponse, number>({
      query: (riderId) => `/riders/${riderId}`,
      providesTags: (result, error, riderId) =>
        result
          ? [
              { type: "Rider" as const, id: riderId },
              { type: "Payment" as const, id: `rider-wallet-${riderId}` },
            ]
          : [{ type: "Rider" as const, id: riderId }],
    }),

    getRiderLedger: build.query<RiderLedgerResponse, { riderId: number; filters?: RiderLedgerFilters }>({
      query: ({ riderId, filters }) => {
        const params = new URLSearchParams();
        if (filters?.limit != null) params.set("limit", String(filters.limit));
        if (filters?.offset != null) params.set("offset", String(filters.offset));
        if (filters?.from) params.set("from", filters.from);
        if (filters?.to) params.set("to", filters.to);
        if (filters?.flow && filters.flow !== "all") params.set("flow", filters.flow);
        if (filters?.entryType && filters.entryType !== "all") params.set("entryType", filters.entryType);
        if (filters?.serviceType && filters.serviceType !== "all") params.set("serviceType", filters.serviceType);
        if (filters?.q) params.set("q", filters.q);
        const qs = params.toString();
        return qs ? `/riders/${riderId}/ledger?${qs}` : `/riders/${riderId}/ledger`;
      },
      providesTags: (result, error, { riderId }) => [
        { type: "Payment" as const, id: `rider-ledger-${riderId}` },
      ],
    }),

    getRiderPenalties: build.query<RiderPenaltiesResponse, { riderId: number; filters?: RiderPenaltiesFilters }>({
      query: ({ riderId, filters }) => {
        const params = new URLSearchParams();
        if (filters?.limit != null) params.set("limit", String(filters.limit));
        if (filters?.offset != null) params.set("offset", String(filters.offset));
        if (filters?.from) params.set("from", filters.from);
        if (filters?.to) params.set("to", filters.to);
        if (filters?.serviceType && filters.serviceType !== "all") params.set("serviceType", filters.serviceType);
        if (filters?.status && filters.status !== "all") params.set("status", filters.status);
        if (filters?.q) params.set("q", filters.q);
        const qs = params.toString();
        return qs ? `/riders/${riderId}/penalties?${qs}` : `/riders/${riderId}/penalties`;
      },
      providesTags: (result, error, { riderId }) => [
        { type: "Rider" as const, id: riderId },
      ],
    }),

    addRiderPenalty: build.mutation<{ success: boolean }, { riderId: number; body: AddRiderPenaltyRequest }>({
      query: ({ riderId, body }) => ({
        url: `/riders/${riderId}/penalties`,
        method: "POST",
        body,
      }),
      invalidatesTags: (result, error, { riderId }) => [
        { type: "Rider" as const, id: riderId },
        { type: "Payment" as const, id: `rider-wallet-${riderId}` },
        { type: "Payment" as const, id: `rider-ledger-${riderId}` },
      ],
    }),

    revertRiderPenalty: build.mutation<
      { success: boolean },
      { riderId: number; penaltyId: number; reason?: string }
    >({
      query: ({ riderId, penaltyId, reason }) => ({
        url: `/riders/${riderId}/penalties/${penaltyId}/revert`,
        method: "POST",
        body: reason ? { reason } : {},
      }),
      invalidatesTags: (result, error, { riderId }) => [
        { type: "Rider" as const, id: riderId },
        { type: "Payment" as const, id: `rider-wallet-${riderId}` },
        { type: "Payment" as const, id: `rider-ledger-${riderId}` },
      ],
    }),

    getRiderOrders: build.query<RiderOrdersResponse, { riderId: number; filters?: RiderOrdersFilters }>({
      query: ({ riderId, filters }) => {
        const params = new URLSearchParams();
        if (filters?.limit != null) params.set("limit", String(filters.limit));
        if (filters?.offset != null) params.set("offset", String(filters.offset));
        if (filters?.orderType && filters.orderType !== "all") params.set("orderType", filters.orderType);
        if (filters?.status && filters.status !== "all") params.set("status", filters.status);
        if (filters?.from) params.set("from", filters.from);
        if (filters?.to) params.set("to", filters.to);
        if (filters?.q) params.set("q", filters.q);
        const qs = params.toString();
        return qs ? `/riders/${riderId}/orders?${qs}` : `/riders/${riderId}/orders`;
      },
      providesTags: (result, error, { riderId }) => [
        { type: "Order" as const, id: `rider-orders-${riderId}` },
      ],
    }),

    getRiderWalletCreditRequests: build.query<
      WalletCreditRequestRow[],
      { riderId: number; status: string; limit?: number }
    >({
      query: ({ riderId, status, limit }) => {
        const params = new URLSearchParams();
        params.set("riderId", String(riderId));
        params.set("status", status);
        if (limit != null) params.set("limit", String(limit));
        const qs = params.toString();
        return qs ? `/wallet-credit-requests?${qs}` : `/wallet-credit-requests`;
      },
      providesTags: (result, error, { riderId, status }) => [
        { type: "Payment" as const, id: `rider-wallet-requests-${riderId}-${status}` },
      ],
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetRiderDetailsQuery,
  useGetRiderLedgerQuery,
  useGetRiderPenaltiesQuery,
  useAddRiderPenaltyMutation,
  useRevertRiderPenaltyMutation,
  useGetRiderOrdersQuery,
  useGetRiderWalletCreditRequestsQuery,
} = riderApi;

