import { create } from "zustand";
import type { Session } from "@gatimitra/contracts";
import { getItem, setItem, removeItem } from "@/src/utils/storage";
import { getOrCreateDeviceId } from "@/src/utils/deviceId";
import { riderAuthService } from "@/src/services/auth/auth.service";

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
};

function buildSession(accessToken: string, meta: SessionMeta): Session {
  return {
    accessToken,
    expiresAt: meta.expiresAt,
    role: meta.role,
    userId: meta.userId,
    riderId: meta.riderId,
  };
}

async function persistSession(session: Session): Promise<void> {
  await setItem(TOKEN_KEY, session.accessToken);
  const meta: SessionMeta = {
    expiresAt: session.expiresAt,
    role: session.role,
    userId: session.userId,
    riderId: session.riderId,
  };
  await setItem(META_KEY, JSON.stringify(meta));
  await removeItem(LEGACY_SESSION_KEY);
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
    await persistSession(parsed);
    return parsed;
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
    set({ session: restored });
    await get().refreshSessionIfNeeded();
    set({ hydrated: true, session: get().session ?? restored });
  } catch (error) {
    console.error("[SessionStore] Hydration error:", error);
    set({ hydrated: true, session: null });
  }
}

export const useSessionStore = create<SessionState>((set, get) => ({
  hydrated: false,
  session: null,

  setSession: async (s) => {
    set({ session: s });
    if (!s) {
      await removeItem(TOKEN_KEY);
      await removeItem(META_KEY);
      await removeItem(LEGACY_SESSION_KEY);
      return;
    }
    await persistSession(s);
  },

  hydrate: () => hydrateRiderSession(set, get),

  refreshSessionIfNeeded: async (opts) => {
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
      console.warn("[SessionStore] Session refresh failed (keeping current token):", error);
    }
  },
}));
