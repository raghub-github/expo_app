import * as SecureStore from "expo-secure-store";

const LAST_SELECTED_STORE_KEY = "gatimitra_merchant_last_selected_store";

export type PersistedSelectedStore = {
  parentId: number;
  storeDbId: number;
  storePublicId: string;
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
