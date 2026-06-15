/**
 * Shared ETA recalculation — delegates to the live ETA engine (v3).
 */
import { runLiveEtaForOrder } from "./eta.live-engine.js";
import { type EtaRecalcReason } from "./eta.repository.js";

export type RecalcOrderEtaInput = {
  reason: EtaRecalcReason;
  extraTrafficMinutes?: number;
  extraWeatherMinutes?: number;
  extraCongestionMinutes?: number;
  riderId?: number;
};

export async function recalcOrderEta(orderIdText: string, input: RecalcOrderEtaInput) {
  const result = await runLiveEtaForOrder(orderIdText, input.reason);
  if (!result) return null;

  return {
    etaMinMinutes: result.currentEtaMinutes,
    etaMaxMinutes: result.currentEtaMinutes,
    promisedDeliveryAt: new Date(Date.now() + result.currentEtaMinutes * 60_000).toISOString(),
    confidenceScore: 0.85,
    engineVersion: "v3-live",
    breakdown: {
      foodPrepMinutes: 0,
      kitchenLoadBufferMinutes: 0,
      riderAssignmentMinutes: 0,
      riderToStoreMinutes: 0,
      riderArrivalMinutes: 0,
      criticalPathMinutes: result.currentEtaMinutes,
      pickupBufferMinutes: 0,
      travelMinutes: 0,
      apartmentBufferMinutes: 0,
      adjustedEtaMinutes: result.currentEtaMinutes,
      uncertaintyMarginMinutes: 0,
    },
    multipliers: { traffic: 1, weather: 1, peakHour: 1 },
    context: {
      weather: "CLEAR" as const,
      peakWindow: "OFF_PEAK" as const,
      dropContext: "UNKNOWN" as const,
      activeOrdersAtStore: 0,
    },
    routeKm: 0,
    generatedAt: new Date().toISOString(),
  };
}
