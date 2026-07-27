import * as SecureStore from "expo-secure-store";

const LAST_SELECTED_STORE_KEY = "gatimitra_merchant_last_selected_store";
const MANAGED_STORES_KEY = "gatimitra_merchant_managed_stores";

export type PersistedSelectedStore = {
  parentId: number;
  storeDbId: number;
  storePublicId: string;
};

export type PersistedManagedStores = {
  parentId: number;
  /** Primary / active outlet (header, settings). */
  primaryStoreDbId: number;
  /** All outlets whose orders land on the shared board. */
  storeDbIds: number[];
};

export async function readLastSelectedStore(): Promise<PersistedSelectedStore | null> {
  try {
    const raw = await SecureStore.getItemAsync(LAST_SELECTED_STORE_KEY);
    if (!raw?.trim()) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedSelectedStore>;
    if (
      typeof parsed.parentId !== "number" ||
      typeof parsed.storeDbId !== "number" ||
      typeof parsed.storePublicId !== "string" ||
      !parsed.storePublicId.trim()
    ) {
      return null;
    }
    return {
      parentId: parsed.parentId,
      storeDbId: parsed.storeDbId,
      storePublicId: parsed.storePublicId.trim(),
    };
  } catch {
    return null;
  }
}

export async function writeLastSelectedStore(snapshot: PersistedSelectedStore): Promise<void> {
  await SecureStore.setItemAsync(LAST_SELECTED_STORE_KEY, JSON.stringify(snapshot));
}

export async function clearLastSelectedStore(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(LAST_SELECTED_STORE_KEY);
  } catch {
    /* ignore */
  }
}

export async function readManagedStores(): Promise<PersistedManagedStores | null> {
  try {
    const raw = await SecureStore.getItemAsync(MANAGED_STORES_KEY);
    if (!raw?.trim()) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedManagedStores>;
    if (
      typeof parsed.parentId !== "number" ||
      typeof parsed.primaryStoreDbId !== "number" ||
      !Array.isArray(parsed.storeDbIds) ||
      parsed.storeDbIds.length === 0
    ) {
      return null;
    }
    const ids = parsed.storeDbIds
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (ids.length === 0) return null;
    return {
      parentId: parsed.parentId,
      primaryStoreDbId: parsed.primaryStoreDbId,
      storeDbIds: [...new Set(ids)],
    };
  } catch {
    return null;
  }
}

export async function writeManagedStores(snapshot: PersistedManagedStores): Promise<void> {
  await SecureStore.setItemAsync(MANAGED_STORES_KEY, JSON.stringify(snapshot));
}

export async function clearManagedStores(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(MANAGED_STORES_KEY);
  } catch {
    /* ignore */
  }
}

/** Locality label from a full address (e.g. "Tiruporur, India" → last locality bits). */
export function localityFromAddress(fullAddress: string | null | undefined): string {
  if (!fullAddress?.trim()) return "";
  const parts = fullAddress.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return `${parts[parts.length - 2]}, ${parts[parts.length - 1]}`;
  return parts[parts.length - 1] ?? fullAddress.trim();
}

/** Short locality for incoming-order headers (city/area only). */
export function shortLocalityFromAddress(fullAddress: string | null | undefined): string {
  if (!fullAddress?.trim()) return "";
  const parts = fullAddress.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    // Prefer the segment before postal/country — often the town name.
    const candidate = parts[parts.length - 2] ?? parts[0]!;
    // Strip leading postal codes like "603110 Tiruporur"
    return candidate.replace(/^\d{5,6}\s+/, "").trim() || candidate;
  }
  return parts[0] ?? "";
}
