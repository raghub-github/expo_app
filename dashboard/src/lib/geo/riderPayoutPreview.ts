/**
 * Client-side rider payout preview — delegates to shared slab pricing engine.
 * Rider Fare Engine v3.0: rider payout is a percentage of customer fare.
 */

import {
  calcServicePayoutRulePreviewBreakdown,
  type ServicePayoutRulePreviewInput,
  type ServicePayoutRulePreviewBreakdown,
} from "@/lib/pricing/slabPricingEngine";
import type { AppliedPreviewSurge, PreviewSurgeDefinition, PreviewSurgeTimeSlot } from "./riderSurgePreview";

export type RiderPayoutPreviewBreakdown = ServicePayoutRulePreviewBreakdown;

export type { AppliedPreviewSurge, PreviewSurgeDefinition, PreviewSurgeTimeSlot, ServicePayoutRulePreviewInput };

export function previewServicePayoutBreakdown(args: {
  customerFare: number;
  pickupKm: number;
  dropKm: number;
  rule: ServicePayoutRulePreviewInput;
  waitingMinutes?: number;
  riderHasGmitraMax?: boolean;
  service: "food" | "parcel" | "ride";
  vehicleType?: string | null;
  surgeDefinitions?: PreviewSurgeDefinition[];
  surgeTimeSlots?: PreviewSurgeTimeSlot[];
  surgeWaitMaxOnly?: boolean;
  maxTotalSurgeAmount?: number | null;
  forceActiveSurgeIds?: number[];
}): RiderPayoutPreviewBreakdown | null {
  return calcServicePayoutRulePreviewBreakdown(args);
}
