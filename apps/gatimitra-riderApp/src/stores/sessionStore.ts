import { create } from "zustand";
import type { Session } from "@gatimitra/contracts";
import { getItem, setItem, removeItem } from "@/src/utils/storage";
import { getOrCreateDeviceId } from "@/src/utils/deviceId";
import { riderIdFromSession } from "@/src/utils/normalizeRiderId";
import { riderAuthService } from "@/src/services/auth/auth.service";
import { isAuthRejectionMessage } from "@/src/services/rider-auth-failure";

const LEGACY_SESSION_KEY = "gm_session_v1";
const TOKEN_KEY = "gm_rider_access_token_v1";
const META_KEY = "gm_rider_session_meta_v1";

type SessionMeta = {
  expiresAt: number;
  role: Session["role"];
  userId: string;
  riderId?: string;
};

type SessionState = {
  hydrated: boolean;
  session: Session | null;
  setSession: (s: Session | null) => Promise<void>;
  hydrate: () => Promise<void>;
  refreshSessionIfNeeded: (opts?: { force?: boolean }) => Promise<void>;
  /**
   * Authoritatively check whether THIS device's session is still valid, by attempting a forced
   * refresh (the /rider/refresh-session endpoint only succeeds when user_device_sessions.is_active
   * is TRUE for the token's device). Returns true when the session is still good (a fresh token is
   * persisted), false only when the server definitively rejects it. Used to gate force-logout so a
   * single transient/racy 401 during cold start never signs the rider out.
   */
  confirmStillValid: () => Promise<boolean>;
};

/** Single-flight refresh so cold-start request storms share one refresh. */
let refreshInFlight: Promise<void> | null = null;

function enrichSession(session: Session): Session {
  const riderId = riderIdFromSession(session) ?? undefined;
  if (!riderId || session.riderId === riderId) return session;
  return { ...session, riderId };
}

function buildSession(accessToken: string, meta: SessionMeta): Session {
  return enrichSession({
    accessToken,
    expiresAt: meta.expiresAt,
    role: meta.role,
    userId: meta.userId,
    riderId: meta.riderId,
  });
}

async function persistSession(session: Session): Promise<void> {
  const enriched = enrichSession(session);
  await setItem(TOKEN_KEY, enriched.accessToken);
  const meta: SessionMeta = {
    expiresAt: enriched.expiresAt,
    role: enriched.role,
    userId: enriched.userId,
    riderId: enriched.riderId,
  };
  await setItem(META_KEY, JSON.stringify(meta));
  await removeItem(LEGACY_SESSION_KEY);

  // Read-after-write: never treat login as success if nothing landed on disk.
  const tokenCheck = await getItem(TOKEN_KEY);
  const metaCheck = await getItem(META_KEY);
  if (!tokenCheck || !metaCheck) {
    throw new Error("Session persist verification failed");
  }
}

async function readPersistedSession(): Promise<Session | null> {
  const token = await getItem(TOKEN_KEY);
  const metaRaw = await getItem(META_KEY);
  if (token && metaRaw) {
    try {
      const meta = JSON.parse(metaRaw) as SessionMeta;
      if (meta.userId && meta.expiresAt && meta.role) {
        return buildSession(token, meta);
      }
    } catch {
      /* fall through to legacy */
    }
  }

  const legacyRaw = await getItem(LEGACY_SESSION_KEY);
  if (!legacyRaw) return null;
  try {
    const parsed = JSON.parse(legacyRaw) as Session;
    if (!parsed?.accessToken || !parsed.userId) return null;
    const enriched = enrichSession(parsed);
    await persistSession(enriched);
    return enriched;
  } catch {
    await removeItem(LEGACY_SESSION_KEY);
    return null;
  }
}

const REFRESH_LEAD_SEC = 60 * 60 * 24; // refresh when < 24h left

async function hydrateRiderSession(
  set: (partial: Partial<SessionState>) => void,
  get: () => SessionState
): Promise<void> {
  if (get().hydrated) return;
  try {
    const restored = await readPersistedSession();
    if (!restored) {
      set({ hydrated: true, session: null });
      return;
    }
    // Paint authenticated immediately — do not flash login while refresh runs.
    set({ session: restored });
    try {
      await get().refreshSessionIfNeeded();
    } catch (error) {
      // Network / refresh hiccup must not wipe a structurally valid local session.
      console.warn("[SessionStore] Hydration refresh failed (keeping restored session):", error);
    }
    set({ hydrated: true, session: get().session ?? restored });
  } catch (error) {
    console.error("[SessionStore] Hydration error:", error);
    // If we already restored a session into memory, keep it; only mark hydrated.
    const current = get().session;
    set({ hydrated: true, session: current });
  }
}

export const useSessionStore = create<SessionState>((set, get) => ({
  hydrated: false,
  session: null,

  setSession: async (s) => {
    if (!s) {
      set({ session: null });
      await removeItem(TOKEN_KEY);
      await removeItem(META_KEY);
      await removeItem(LEGACY_SESSION_KEY);
      return;
    }
    const enriched = enrichSession(s);
    // Optimistic memory write so navigation can proceed; persist must succeed.
    set({ session: enriched });
    await persistSession(enriched);
  },

  hydrate: () => hydrateRiderSession(set, get),

  refreshSessionIfNeeded: async (opts) => {
    if (refreshInFlight) {
      await refreshInFlight;
      return;
    }

    refreshInFlight = (async () => {
      const current = get().session;
      if (!current?.accessToken || current.role !== "rider") return;
      const nowSec = Math.floor(Date.now() / 1000);
      if (!opts?.force && current.expiresAt - nowSec > REFRESH_LEAD_SEC) return;

      try {
        const deviceId = await getOrCreateDeviceId();
        const next = await riderAuthService.refreshSession({
          accessToken: current.accessToken,
          deviceId,
        });
        await get().setSession(next);
        console.log("[SessionStore] Session refreshed");
      } catch (error) {
        // Never clear the local session here — callers / SessionRevokedGate decide.
        console.warn("[SessionStore] Session refresh failed (keeping current token):", error);
      }
    })().finally(() => {
      refreshInFlight = null;
    });

    await refreshInFlight;
  },

  confirmStillValid: async () => {
    const current = get().session;
    if (!current?.accessToken || current.role !== "rider") return false;
    try {
      const deviceId = await getOrCreateDeviceId();
      const next = await riderAuthService.refreshSession({
        accessToken: current.accessToken,
        deviceId,
      });
      await get().setSession(next);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Network / server hiccup (not an auth rejection) → treat as STILL valid so we never sign the
      // rider out on a transient failure. Only a definitive auth rejection confirms it is truly gone.
      if (!isAuthRejectionMessage(message)) {
        console.warn("[SessionStore] confirmStillValid: transient refresh failure, keeping session:", message);
        return true;
      }
      return false;
    }
  },
}));