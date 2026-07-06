import type { SurgeDefinitionRow, SurgeTimeSlotRow } from "@/lib/db/operations/rider-surge-admin";
import type { PreviewSurgeDefinition, PreviewSurgeTimeSlot } from "./riderSurgePreview";

function riderSurgeVehicleScope(def: SurgeDefinitionRow): string {
  const enabled: string[] = [];
  if (def.vehicle2Wheeler) enabled.push("2_wheeler");
  if (def.vehicle3Wheeler) enabled.push("3_wheeler");
  if (def.vehicle4WheelerAc) enabled.push("4_wheeler_ac");
  if (def.vehicle4WheelerNonAc) enabled.push("4_wheeler_non_ac");
  if (enabled.length === 0) return "none";
  if (enabled.length === 4) return "all";
  if (enabled.length === 1) return enabled[0]!;
  return "all";
}

/** Map DB rider surge rows to preview-engine shape (fixed surges only). */
export function mapRiderSurgeDefinitionToPreview(def: SurgeDefinitionRow): PreviewSurgeDefinition {
  return {
    id: def.id,
    name: def.name,
    surgeType: "fixed",
    amount: def.fixedAmount,
    priority: def.priority,
    isEnabled: def.isEnabled,
    gmitraMaxOnly: def.gmitraMaxOnly,
    appliesFood: def.appliesFood,
    appliesParcel: def.appliesParcel,
    appliesRide: def.appliesRide,
    vehicleType: riderSurgeVehicleScope(def),
    manualActive: def.manualActive,
  };
}

export function mapRiderSurgeTimeSlotToPreview(slot: SurgeTimeSlotRow): PreviewSurgeTimeSlot {
  return {
    id: slot.id,
    surgeId: slot.surgeId,
    startTime: slot.startTime,
    endTime: slot.endTime,
    daysOfWeek: slot.daysOfWeek,
    isEnabled: slot.isEnabled,
  };
}
