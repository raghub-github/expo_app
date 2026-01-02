import { create } from "zustand";
import type { Session } from "@gatimitra/contracts";
import { getItem, setItem, removeItem } from "@/src/utils/storage";

const SESSION_KEY = "gm_session_v1";

type SessionState = {
  hydrated: boolean;
  session: Session | null;
  setSession: (s: Session | null) => Promise<void>;
  hydrate: () => Promise<void>;
};

export const useSessionStore = create<SessionState>((set, get) => ({
  hydrated: false,
  session: null,

  setSession: async (s) => {
    set({ session: s });
    if (!s) {
      await removeItem(SESSION_KEY);
      return;
    }
    await setItem(SESSION_KEY, JSON.stringify(s));
  },

  hydrate: async () => {
    if (get().hydrated) {
      console.log('[SessionStore] Already hydrated');
      return;
    }
    console.log('[SessionStore] Starting hydration');
    try {
      const raw = await getItem(SESSION_KEY);
      if (!raw) {
        console.log('[SessionStore] No session found');
        set({ hydrated: true, session: null });
        return;
      }
      try {
        const parsed = JSON.parse(raw) as Session;
        console.log('[SessionStore] Session restored');
        set({ hydrated: true, session: parsed });
      } catch (parseError) {
        console.warn('[SessionStore] Failed to parse session, clearing:', parseError);
        await removeItem(SESSION_KEY);
        set({ hydrated: true, session: null });
      }
    } catch (error) {
      console.error('[SessionStore] Hydration error:', error);
      // Always set hydrated to true even on error
      set({ hydrated: true, session: null });
    }
  },
}));


