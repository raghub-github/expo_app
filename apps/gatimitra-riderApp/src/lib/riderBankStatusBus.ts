import { DeviceEventEmitter } from "react-native";

export const RIDER_BANK_STATUS_EVENT = "bank_status";
export const RIDER_BANK_STATUS_BUS = "rider-bank-status-live";

export function riderBankStatusChannel(riderId: number | string): string {
  return `rider_bank_status:${riderId}`;
}

export type RiderBankStatusLiveState = {
  riderId: number;
  action: "approved" | "rejected";
  verificationStatus: "verified" | "rejected";
  paymentMethodId: number | string | null;
  reason: string | null;
  at: number;
};

export function emitRiderBankStatus(state: RiderBankStatusLiveState): void {
  if (!Number.isFinite(state.riderId) || state.riderId < 1) return;
  DeviceEventEmitter.emit(RIDER_BANK_STATUS_BUS, state);
}

export function subscribeRiderBankStatus(
  cb: (state: RiderBankStatusLiveState) => void,
): () => void {
  const sub = DeviceEventEmitter.addListener(RIDER_BANK_STATUS_BUS, cb);
  return () => sub.remove();
}

export function bankStatusFromUnknown(raw: unknown): RiderBankStatusLiveState | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const riderId = Number(row.riderId ?? row.rider_id);
  if (!Number.isInteger(riderId) || riderId < 1) return null;

  const actionRaw = String(row.action ?? "").toLowerCase();
  const statusRaw = String(
    row.verificationStatus ?? row.verification_status ?? "",
  ).toLowerCase();

  let action: "approved" | "rejected" | null = null;
  if (actionRaw === "approved" || statusRaw === "verified") action = "approved";
  if (actionRaw === "rejected" || statusRaw === "rejected") action = "rejected";
  if (!action) return null;

  const reasonRaw = row.reason;
  return {
    riderId,
    action,
    verificationStatus: action === "approved" ? "verified" : "rejected",
    paymentMethodId:
      row.paymentMethodId != null
        ? (row.paymentMethodId as number | string)
        : row.payment_method_id != null
          ? (row.payment_method_id as number | string)
          : null,
    reason:
      typeof reasonRaw === "string" && reasonRaw.trim() ? reasonRaw.trim() : null,
    at: Date.now(),
  };
}
