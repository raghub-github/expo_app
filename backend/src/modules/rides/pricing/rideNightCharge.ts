/**
 * Night charge engine — time-window Fixed / Per KM / Percentage with funding split.
 */

import {
  normalizeFundingShares,
  type ComponentFundingMode,
} from "./rideWaitingCharge.js";

export type NightCalcType = "FIXED" | "PER_KM" | "PERCENTAGE";

export type NightChargeConfig = {
  startTime: string; // HH:MM or HH:MM:SS
  endTime: string;
  calcType: NightCalcType;
  valueNumeric: number;
  fundingMode?: ComponentFundingMode | null;
  customerSharePct?: number | null;
  companySharePct?: number | null;
};

export type NightChargeResult = {
  applicable: boolean;
  total: number;
  customerShare: number;
  companyShare: number;
  fundingMode: ComponentFundingMode;
  calcType: NightCalcType;
};

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function parseHhMm(value: string): number | null {
  const m = String(value ?? "").trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** True when `at` falls inside [start, end) supporting overnight windows. */
export function isWithinNightWindow(at: Date, startTime: string, endTime: string): boolean {
  const start = parseHhMm(startTime);
  const end = parseHhMm(endTime);
  if (start == null || end == null) return false;
  const minutes = at.getHours() * 60 + at.getMinutes();
  if (start === end) return true; // 24h window
  if (start < end) return minutes >= start && minutes < end;
  // Overnight e.g. 22:00 → 06:00
  return minutes >= start || minutes < end;
}

export function computeNightCharge(args: {
  at: Date;
  tripKm: number;
  baseAmount: number;
  config: NightChargeConfig;
}): NightChargeResult {
  const cfg = args.config;
  const funding = normalizeFundingShares(
    cfg.fundingMode,
    cfg.customerSharePct,
    cfg.companySharePct
  );
  const empty: NightChargeResult = {
    applicable: false,
    total: 0,
    customerShare: 0,
    companyShare: 0,
    fundingMode: funding.mode,
    calcType: cfg.calcType,
  };
  if (!isWithinNightWindow(args.at, cfg.startTime, cfg.endTime)) return empty;

  const value = Math.max(0, Number(cfg.valueNumeric) || 0);
  let total = 0;
  if (cfg.calcType === "FIXED") total = round2(value);
  else if (cfg.calcType === "PER_KM") total = round2(Math.max(0, args.tripKm) * value);
  else if (cfg.calcType === "PERCENTAGE") {
    total = round2((Math.max(0, args.baseAmount) * value) / 100);
  }
  if (!(total > 0)) return { ...empty, applicable: true };

  const customerShare = round2((total * funding.customerPct) / 100);
  const companyShare = round2(Math.max(0, total - customerShare));
  return {
    applicable: true,
    total,
    customerShare,
    companyShare,
    fundingMode: funding.mode,
    calcType: cfg.calcType,
  };
}
