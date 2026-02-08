/**
 * Shared types for Rider Dashboard (and reusable for Customer/Merchant dashboards later).
 */

/** Flow: MOBILE_VERIFIED → KYC → APPROVAL (docs) → PAYMENT (fees) → ACTIVE */
export const ONBOARDING_STAGE_LABELS: Record<string, string> = {
  MOBILE_VERIFIED: "Mobile verified",
  KYC: "KYC",
  APPROVAL: "Docs approval",
  PAYMENT: "Payment (fees)",
  ACTIVE: "Active",
};

export type RiderListEntry = {
  id: number;
  name: string | null;
  mobile: string;
  country_code: string;
  city: string | null;
  state: string | null;
  pincode: string | null;
  status: string;
  onboarding_stage: string;
  kyc_status: string;
};

export interface RiderSummary {
  rider: {
    id: number;
    name: string | null;
    mobile: string;
    countryCode: string;
    city: string | null;
    state: string | null;
    pincode: string | null;
    status: string;
    onboardingStage: string;
    kycStatus: string;
    vehicleChoice: string | null;
    selfieUrl: string | null;
    isOnline: boolean;
    lastDutyStatus: string;
    lastDutyTimestamp: string | null;
    currentDutyServiceTypes: string[];
  };
  vehicle: {
    id: number;
    vehicleType: string;
    registrationNumber: string;
    make: string | null;
    model: string | null;
    fuelType: string | null;
    vehicleCategory: string | null;
    acType: string | null;
    serviceTypes: string[];
    verified: boolean;
  } | null;
  recentOrders: any[];
  recentWithdrawals: any[];
  recentTickets: any[];
  recentPenalties: {
    id: number;
    orderId: number | null;
    serviceType: string;
    penaltyType: string;
    amount: string;
    reason: string;
    status: string;
    imposedAt: string;
    resolvedAt: string | null;
    imposedByEmail?: string | null;
    imposedByName?: string | null;
    reversedByEmail?: string | null;
    reversedByName?: string | null;
  }[];
  blacklistStatusByService: Record<
    string,
    {
      isBanned: boolean;
      reason: string;
      isPermanent: boolean;
      expiresAt: string | null;
      createdAt: string;
      source?: string;
      remainingMs?: number | null;
      /** Agent who performed the action (when source is agent) */
      actorEmail?: string | null;
      actorName?: string | null;
      /** When "All Services" is banned but some individual services are whitelisted */
      partiallyAllowedServices?: string[];
    } | null
  >;
  /** Latest blacklist/whitelist actions (newest first) for history UI */
  blacklistHistory?: {
    id: number;
    serviceType: string;
    banned: boolean;
    reason: string;
    source: string;
    isPermanent: boolean;
    expiresAt: string | null;
    createdAt: string;
    actorEmail: string | null;
    actorName: string | null;
  }[];
  orderMetrics: {
    food: { sent: number; accepted: number; completed: number; rejected: number };
    parcel: { sent: number; accepted: number; completed: number; rejected: number };
    person_ride: { sent: number; accepted: number; completed: number; rejected: number };
  };
  wallet: {
    totalBalance: string;
    withdrawable: string;
    locked: string;
    securityBalance: string;
    earningsFood: string;
    earningsParcel: string;
    earningsPersonRide: string;
    penaltiesFood: string;
    penaltiesParcel: string;
    penaltiesPersonRide: string;
    totalWithdrawn: string;
    lastUpdatedAt: string | null;
    isFrozen?: boolean;
    frozenAt?: string | null;
    latestFreezeAction?: {
      action: string;
      reason: string | null;
      createdAt: string;
      performedByEmail: string | null;
      performedByName: string | null;
    } | null;
  } | null;
  /** Onboarding (registration) fees paid by the rider – shown on home when not verified, and in wallet/full details */
  onboardingFees?: {
    totalPaid: string;
    transactions: {
      id: number;
      amount: string;
      provider: string;
      refId: string;
      status: string;
      createdAt: string;
    }[];
  };
}

/** Minimal rider info for sub-pages (penalties, orders, etc.) */
export interface RiderSummaryInfo {
  id: number;
  name: string | null;
  mobile: string;
  city: string | null;
  state: string | null;
  status: string;
  onboardingStage: string;
  kycStatus: string;
}
