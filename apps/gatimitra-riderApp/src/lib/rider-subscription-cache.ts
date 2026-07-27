import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "rider.subscription.status.v1";

/** Minimal shape needed for instant MAX badge — avoids circular imports. */
export type CachedRiderSubscriptionStatus = {
  active: boolean;
  plan: unknown;
  dues?: unknown;
};

let memoryCache: CachedRiderSubscriptionStatus | null | undefined;

export function getCachedRiderSubscriptionStatus(): CachedRiderSubscriptionStatus | null {
  return memoryCache ?? null;
}

export async function hydrateRiderSubscriptionCache(): Promise<CachedRiderSubscriptionStatus | null> {
  if (memoryCache !== undefined) return memoryCache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) {
      memoryCache = null;
      return null;
    }
    memoryCache = JSON.parse(raw) as CachedRiderSubscriptionStatus;
    return memoryCache;
  } catch {
    memoryCache = null;
    return null;
  }
}

export async function persistRiderSubscriptionStatus(
  status: CachedRiderSubscriptionStatus
): Promise<void> {
  memoryCache = status;
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(status));
  } catch {
    /* ignore */
  }
}
