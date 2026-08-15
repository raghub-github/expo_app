import { DeviceEventEmitter } from "react-native";

export const MERCHANT_STORE_DELIST_EVENT = "store_delist";
export const MERCHANT_STORE_DELIST_BUS = "merchant-store-delist-live";

export function merchantStoreDelistChannel(storeId: number | string): string {
  return `merchant_store_delist:${storeId}`;
}

export type MerchantStoreDelistLiveState = {
  storeId: number;
  isDelisted: boolean;
};

const latestByStore = new Map<number, MerchantStoreDelistLiveState>();

export function getMerchantStoreDelistSnapshot(
  storeId: number | null | undefined,
): MerchantStoreDelistLiveState | null {
  if (storeId == null || !Number.isFinite(storeId) || storeId < 1) return null;
  return latestByStore.get(storeId) ?? null;
}

export function emitMerchantStoreDelist(state: MerchantStoreDelistLiveState): void {
  if (!Number.isFinite(state.storeId) || state.storeId < 1) return;
  const next: MerchantStoreDelistLiveState = {
    storeId: state.storeId,
    isDelisted: state.isDelisted === true,
  };
  const prev = latestByStore.get(next.storeId);
  if (prev && prev.isDelisted === next.isDelisted) return;
  latestByStore.set(next.storeId, next);
  DeviceEventEmitter.emit(MERCHANT_STORE_DELIST_BUS, next);
}

export function subscribeMerchantStoreDelist(
  cb: (state: MerchantStoreDelistLiveState) => void,
): () => void {
  const sub = DeviceEventEmitter.addListener(MERCHANT_STORE_DELIST_BUS, cb);
  return () => sub.remove();
}

export function delistStateFromUnknown(raw: unknown): boolean | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (row.action === "relist" || row.isDelisted === false || row.is_delisted === false) return false;
  if (row.action === "delist" || row.isDelisted === true || row.is_delisted === true) return true;
  if (row.delisted_at != null && String(row.delisted_at).trim() !== "") return true;
  const approval = String(row.approval_status ?? "").toUpperCase();
  if (approval === "DELISTED") return true;
  if (approval && approval !== "DELISTED") return false;
  return null;
}
