export type MerchantCompensationScenarioCode =
  | "ORDER_PICKED_UP"
  | "ORDER_READY_HIGH_ACCURACY"
  | "ORDER_READY_LOW_ACCURACY"
  | "NOT_ORDER_READY";

export type MerchantCompensationExclusionCode =
  | "CUSTOMER_CANCEL_WITHIN_GRACE"
  | "MERCHANT_ACCEPTED_CANCEL";

export type MerchantCompensationEngineSettings = {
  isEnabled: boolean;
  orderReadyAccuracyThreshold: number;
  customerCancelGraceSeconds: number;
  amountBase: string;
  policyModalTitle: string;
  updatedAt: string;
};

export type MerchantCompensationScenarioConfigRow = {
  scenarioCode: MerchantCompensationScenarioCode;
  isEnabled: boolean;
  compensationPct: number;
  sortOrder: number;
  policyTitle: string;
  policyDescription: string;
  ledgerTitle: string;
  ledgerDescription: string;
  updatedAt: string;
};

export type MerchantCompensationExclusionRuleRow = {
  exclusionCode: MerchantCompensationExclusionCode;
  isEnabled: boolean;
  policyTitle: string;
  policyDescription: string;
  updatedAt: string;
};

export type MerchantCompensationEnginePayload = {
  migrationRequired: boolean;
  settings: MerchantCompensationEngineSettings | null;
  scenarios: MerchantCompensationScenarioConfigRow[];
  exclusions: MerchantCompensationExclusionRuleRow[];
};

export type SaveMerchantCompensationEngineInput = {
  settings?: Partial<{
    isEnabled: boolean;
    orderReadyAccuracyThreshold: number;
    customerCancelGraceSeconds: number;
    amountBase: string;
    policyModalTitle: string;
  }>;
  scenarios?: Partial<
    Record<
      MerchantCompensationScenarioCode,
      {
        isEnabled?: boolean;
        compensationPct?: number;
        policyTitle?: string;
        policyDescription?: string;
        ledgerTitle?: string;
        ledgerDescription?: string;
      }
    >
  >;
  exclusions?: Partial<
    Record<
      MerchantCompensationExclusionCode,
      {
        isEnabled?: boolean;
        policyTitle?: string;
        policyDescription?: string;
      }
    >
  >;
};

export type ResolvedMerchantCompensation = {
  engineEnabled: boolean;
  compensationPct: number;
  clawbackPct: number;
  scenarioCode: MerchantCompensationScenarioCode | "NO_COMPENSATION";
  exclusionCode: MerchantCompensationExclusionCode | null;
  netOrderValue: number;
  merchantKeepsAmount: number;
  clawbackAmount: number;
  orderReadyAccuracyPct: number | null;
  policyTitle: string;
  policyDescription: string;
};
