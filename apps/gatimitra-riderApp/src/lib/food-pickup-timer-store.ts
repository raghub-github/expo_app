import * as SecureStore from "expo-secure-store";

const memory = new Map<string, string>();

function storageKey(orderKey: string): string {
  return `pickup_timer_start:${orderKey}`;
}

/** Earliest persisted pickup-window start for this order (survives app restart). */
export async function readPersistedPickupTimerStart(
  orderKey: string
): Promise<string | null> {
  const cached = memory.get(orderKey);
  if (cached) return cached;
  try {
    const stored = await SecureStore.getItemAsync(storageKey(orderKey));
    if (stored) memory.set(orderKey, stored);
    return stored;
  } catch {
    return null;
  }
}

export function readPersistedPickupTimerStartSync(orderKey: string): string | null {
  return memory.get(orderKey) ?? null;
}

export async function persistPickupTimerStart(
  orderKey: string,
  iso: string
): Promise<void> {
  const prev = memory.get(orderKey);
  if (prev && new Date(prev).getTime() <= new Date(iso).getTime()) return;
  memory.set(orderKey, iso);
  try {
    await SecureStore.setItemAsync(storageKey(orderKey), iso);
  } catch {
    /* non-fatal */
  }
}

export async function clearPersistedPickupTimerStart(orderKey: string): Promise<void> {
  memory.delete(orderKey);
  try {
    await SecureStore.deleteItemAsync(storageKey(orderKey));
  } catch {
    /* non-fatal */
  }
}
