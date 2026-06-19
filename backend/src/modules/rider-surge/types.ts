export type RiderSurgeKind = "peak_hour" | "rain" | "festival" | "custom";

export type SurgeDefinitionRow = {
  id: number;
  name: string;
  description: string | null;
  kind: RiderSurgeKind;
  fixedAmount: number;
  priority: number;
  isEnabled: boolean;
  gmitraMaxOnly: boolean;
  appliesFood: boolean;
  appliesParcel: boolean;
  appliesRide: boolean;
  vehicle2Wheeler: boolean;
  vehicle3Wheeler: boolean;
  vehicle4WheelerAc: boolean;
  vehicle4WheelerNonAc: boolean;
  manualActive: boolean;
};

export type SurgeTimeSlotRow = {
  id: number;
  surgeId: number;
  startTime: string;
  endTime: string;
  daysOfWeek: number[];
  isEnabled: boolean;
};

export type SurgeSettingsRow = {
  maxTotalSurgeAmount: number | null;
  surgeWaitMaxOnly: boolean;
};

export type AppliedRiderSurge = {
  surgeId: number;
  name: string;
  kind: RiderSurgeKind;
  amount: number;
};

export type RiderSurgeResolution = {
  appliedSurges: AppliedRiderSurge[];
  rawSurgeTotal: number;
  surgeTotal: number;
  surgeCapped: boolean;
  maxTotalSurgeAmount: number | null;
};
