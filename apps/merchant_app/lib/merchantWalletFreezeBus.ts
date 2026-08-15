import { DeviceEventEmitter } from "react-native";

export const MERCHANT_WALLET_FREEZE_EVENT = "wallet_freeze";
export const MERCHANT_WALLET_FREEZE_BUS = "merchant-wallet-freeze-live";

export function merchantWalletFreezeChannel(storeId: number | string): string {
  return `merchant_wallet_freeze:${storeId}`;
}

export type MerchantWalletFreezeLiveState = {
  storeId: number;
  isFrozen: boolean;
  freezeReason: string | null;
};

const latestByStore = new Map<number, MerchantWalletFreezeLiveState>();

export function getMerchantWalletFreezeSnapshot(
  storeId: number | null | undefined,
): MerchantWalletFreezeLiveState | null {
  if (storeId == null || !Number.isFinite(storeId) || storeId < 1) return null;
  return latestByStore.get(storeId) ?? null;
}

export function emitMerchantWalletFreeze(state: MerchantWalletFreezeLiveState): void {
  if (!Number.isFinite(state.storeId) || state.storeId < 1) return;
  const next: MerchantWalletFreezeLiveState = {
    storeId: state.storeId,
    isFrozen: state.isFrozen === true,
    freezeReason: state.isFrozen ? state.freezeReason ?? null : null,
  };
  const prev = latestByStore.get(next.storeId);
  if (
    prev &&
    prev.isFrozen === next.isFrozen &&
    (prev.freezeReason ?? null) === (next.freezeReason ?? null)
  ) {
    return;
  }
  latestByStore.set(next.storeId, next);
  DeviceEventEmitter.emit(MERCHANT_WALLET_FREEZE_BUS, next);
}

export function subscribeMerchantWalletFreeze(
  cb: (state: MerchantWalletFreezeLiveState) => void,
): () => void {
  const sub = DeviceEventEmitter.addListener(MERCHANT_WALLET_FREEZE_BUS, cb);
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
    (status && status !== "FROZEN") ||
    row.action === "unfreeze";
  if (!flagged && !unflagged) return null;
  const isFrozen = flagged && row.action !== "unfreeze" && status !== "ACTIVE";
  const reasonRaw = row.freezeReason ?? row.frozen_reason ?? row.reason ?? null;
  const freezeReason =
    isFrozen && typeof reasonRaw === "string" && reasonRaw.trim() ? reasonRaw.trim() : null;
  return { isFrozen, freezeReason };
}
