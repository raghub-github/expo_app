export interface StoredBootstrapPayload<T> {
  /** Actual bootstrap payload (session, permissions, dashboard access, etc.) */
  data: T;
  /** When this payload was stored (epoch ms) */
  storedAt: number;
}

const STORAGE_KEY = "dashboard_bootstrap_cache_v1";

/**
 * Persist bootstrap payload to localStorage for instant dashboard load on next navigation.
 * Only called on the client.
 */
export function saveBootstrapToStorage<T>(payload: T): void {
  if (typeof window === "undefined") return;
  try {
    const wrapped: StoredBootstrapPayload<T> = {
      data: payload,
      storedAt: Date.now(),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(wrapped));
  } catch {
    // Ignore storage errors (private mode / quota)
  }
}

/**
 * Load bootstrap payload from localStorage if it exists and is not older than maxAgeMs.
 * Returns null when no valid cached payload is available.
 */
export function loadBootstrapFromStorage<T>(maxAgeMs: number): StoredBootstrapPayload<T> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredBootstrapPayload<T> | null;
    if (!parsed || typeof parsed.storedAt !== "number") return null;
    if (Date.now() - parsed.storedAt > maxAgeMs) return null;
    return parsed;
  } catch {
    return null;
  }
}

