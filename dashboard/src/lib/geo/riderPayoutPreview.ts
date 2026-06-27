/**
 * Client-side rider payout preview — delegates to shared slab pricing engine.
 */

import {
  calcRiderPreviewBreakdown,
  type PickupSlab,
  type DropSlab,
  type RiderPreviewBreakdown,
} from "@/lib/pricing/slabPricingEngine";
import type { AppliedPreviewSurge, PreviewSurgeDefinition, PreviewSurgeTimeSlot } from "./riderSurgePreview";

export type PreviewPickupSlab = PickupSlab & { id: number };
export type PreviewDropSlab = DropSlab & { id: number };

export type RiderPayoutPreviewBreakdown = RiderPreviewBreakdown;

export type { AppliedPreviewSurge, PreviewSurgeDefinition, PreviewSurgeTimeSlot };

export function previewRiderPayoutBreakdown(args: {
  pickupKm: number;
  dropKm: number;
  pickupSlabs: PreviewPickupSlab[];
  dropSlabs: PreviewDropSlab[];
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
  return calcRiderPreviewBreakdown(args);
}

export function previewRiderPayout(args: Parameters<typeof previewRiderPayoutBreakdown>[0]): number {
  const breakdown = previewRiderPayoutBreakdown(args);
  return breakdown?.finalAmount ?? 0;
}
