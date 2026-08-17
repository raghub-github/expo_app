import { DeviceEventEmitter } from "react-native";

export const RIDER_WALLET_FREEZE_EVENT = "wallet_freeze";
export const RIDER_WALLET_FREEZE_BUS = "rider-wallet-freeze-live";

export function riderWalletFreezeChannel(riderId: number | string): string {
  return `rider_wallet_freeze:${riderId}`;
}

export type RiderWalletFreezeLiveState = {
  riderId: number;
  isFrozen: boolean;
  freezeReason: string | null;
};

const latestByRider = new Map<number, RiderWalletFreezeLiveState>();

export function getRiderWalletFreezeSnapshot(
  riderId: number | null | undefined,
): RiderWalletFreezeLiveState | null {
  if (riderId == null || !Number.isFinite(riderId) || riderId < 1) return null;
  return latestByRider.get(riderId) ?? null;
}

export function emitRiderWalletFreeze(state: RiderWalletFreezeLiveState): void {
  if (!Number.isFinite(state.riderId) || state.riderId < 1) return;
  const next: RiderWalletFreezeLiveState = {
    riderId: state.riderId,
    isFrozen: state.isFrozen === true,
    freezeReason: state.isFrozen ? state.freezeReason ?? null : null,
  };
  const prev = latestByRider.get(next.riderId);
  if (
    prev &&
    prev.isFrozen === next.isFrozen &&
    (prev.freezeReason ?? null) === (next.freezeReason ?? null)
  ) {
    return;
  }
  latestByRider.set(next.riderId, next);
  DeviceEventEmitter.emit(RIDER_WALLET_FREEZE_BUS, next);
}

export function subscribeRiderWalletFreeze(
  cb: (state: RiderWalletFreezeLiveState) => void,
): () => void {
  const sub = DeviceEventEmitter.addListener(RIDER_WALLET_FREEZE_BUS, cb);
  return () => sub.remove();
}

export function freezeStateFromUnknown(raw: unknown): {
  isFrozen: boolean;
  freezeReason: string | null;
} | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const status = String(row.status ?? row.new_status ?? "").toUpperCase();
  const flagged =
    row.isFrozen === true ||
    row.is_frozen === true ||
    status === "FROZEN" ||
    row.action === "freeze";
  const unflagged =
    row.isFrozen === false ||
    row.is_frozen === false ||
    row.action === "unfreeze" ||
    (status === "ACTIVE" && row.action !== "freeze");
  if (!flagged && !unflagged) return null;
  const isFrozen = Boolean(flagged && row.action !== "unfreeze" && status !== "ACTIVE");
  const reasonRaw = row.freezeReason ?? row.frozen_reason ?? row.reason ?? null;
  const freezeReason =
    isFrozen && typeof reasonRaw === "string" && reasonRaw.trim() ? reasonRaw.trim() : null;
  return { isFrozen, freezeReason };
}
