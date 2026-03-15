/**
 * Stable device/browser identifier for session scoping.
 * Stored in localStorage so the same browser always sends the same id,
 * avoiding multiple sessions per device when set-cookie is called multiple times.
 */

const STORAGE_KEY = "partner_device_id";

function generate(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `dev_${crypto.randomUUID()}`;
  }
  return `dev_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
}

/**
 * Get or create a stable device id for this browser (localStorage).
 * Call before POST /api/merchant-auth/set-cookie and send in body as device_id.
 */
export function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return generate();
  try {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id || id.length < 10) {
      id = generate();
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    return generate();
  }
}
