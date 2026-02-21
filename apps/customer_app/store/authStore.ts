/**
 * Auth global state - session, hydration, login/logout.
 * Hydrate on app start to support auto-login.
 */

import { create } from "zustand";
import type { Session } from "@gatimitra/contracts";
import { authService } from "@/services/auth.service";
import { getItem, setItem, removeItem } from "@/utils/storage";
import { STORAGE_KEYS } from "@/constants";

type AuthState = {
  hydrated: boolean;
  session: Session | null;
  setSession: (s: Session | null) => Promise<void>;
  hydrate: () => Promise<void>;
  logout: () => Promise<void>;
  logoutAllDevices: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  hydrated: false,
  session: null,

  setSession: async (s) => {
    if (!s) {
      await authService.clearSession();
      set({ session: null });
      return;
    }
    await authService.persistSession(s);
    set({ session: s });
  },

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const session = await authService.getStoredSession();
      set({ session, hydrated: true });
    } catch (e) {
      console.warn("[AuthStore] hydrate failed:", e);
      set({ session: null, hydrated: true });
    }
  },

  logout: async () => {
    await authService.clearSession();
    set({ session: null });
  },

  logoutAllDevices: async () => {
    try {
      await authService.logoutAllDevices();
    } catch {
      // Continue to clear local session even if API fails
    }
    await authService.clearSession();
    set({ session: null });
  },
}));
