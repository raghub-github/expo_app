import { getItem, setItem } from "./storage";

const DEVICE_ID_KEY = "gm_device_id_v1";

let inFlight: Promise<string> | null = null;

function createDeviceId(): string {
  // Not a hardware identifier; this is an app-scoped stable id for session binding.
  return `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Stable per-install device id. Single-flight + read-after-write so a SecureStore
 * hiccup cannot mint a new id on every cold start (that causes SESSION_CONFLICT 409
 * and forces takeover / re-OTP UX).
 */
export async function getOrCreateDeviceId(): Promise<string> {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const existing = await getItem(DEVICE_ID_KEY);
    if (existing?.trim()) return existing.trim();

    const created = createDeviceId();
    await setItem(DEVICE_ID_KEY, created);
    const verified = await getItem(DEVICE_ID_KEY);
    if (verified?.trim()) return verified.trim();
    // Last resort: return created for this process, but persistence failed — next
    // cold start may regenerate (setItem should have thrown; this is defensive).
    console.warn("[deviceId] Persist verification failed; using in-memory id for this session");
    return created;
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}
