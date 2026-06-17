export type PenaltyPartyCode = "RIDER" | "MERCHANT" | "CUSTOMER";

export type RiderPenaltyScenarioCode = "AFTER_ACCEPT_DISPATCH" | "AFTER_MARK_PICKUP";

export type RiderPenaltyAmountBase = "DELIVERY_FARE" | "COMPLETE_ORDER_VALUE";

export type PartyPenaltyPanelRow = {
  partyCode: PenaltyPartyCode;
  isEnabled: boolean;
  panelLabel: string;
  updatedAt: string;
};

export type RiderPenaltyScenarioConfigRow = {
  id: number;
  scenarioCode: RiderPenaltyScenarioCode;
  isEnabled: boolean;
  flatPenaltyAmount: number | null;
  ledgerTitle: string;
  ledgerDescription: string;
  penaltyTitle: string;
  amountBase: RiderPenaltyAmountBase | null;
  updatedAt: string;
};

export type RiderPenaltyReasonRuleRow = {
  id: number;
  scenarioCode: RiderPenaltyScenarioCode;
  catalogReasonId: number;
  appliesPenalty: boolean;
  reasonLabel: string;
  reasonCode: string;
  attribute: string;
  defaultFault: string;
};

export type PenaltyCatalogChannel = "web" | "app";

export type RiderPenaltyCatalogReason = {
  id: number;
  attribute: string;
  label: string;
  reasonCode: string;
  sortOrder: number;
  isActive: boolean;
  channel?: PenaltyCatalogChannel;
  serviceType?: string | null;
};

export type RiderPenaltyEnginePayload = {
  migrationRequired: boolean;
  channel: PenaltyCatalogChannel;
  parties: PartyPenaltyPanelRow[];
  scenarios: RiderPenaltyScenarioConfigRow[];
  reasonRules: RiderPenaltyReasonRuleRow[];
  riderReasons: RiderPenaltyCatalogReason[];
};

export type SaveRiderPenaltyEngineInput = {
  parties?: Partial<Record<PenaltyPartyCode, { isEnabled?: boolean }>>;
  scenarios?: Partial<
    Record<
      RiderPenaltyScenarioCode,
      {
        isEnabled?: boolean;
        flatPenaltyAmount?: number | null;
        ledgerTitle?: string;
        ledgerDescription?: string;
        penaltyTitle?: string;
        amountBase?: RiderPenaltyAmountBase | null;
      }
    >
  >;
  reasonRules?: Array<{
    scenarioCode: RiderPenaltyScenarioCode;
    catalogReasonId: number;
    appliesPenalty: boolean;
  }>;
  updatedBy?: string | null;
  channel?: "web" | "app";
};
