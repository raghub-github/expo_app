/**
 * Auth global state - session, hydration, login/logout.
 * Hydrate on app start to support auto-login.
 *
 * Every session transition is a customer-isolation boundary: login, logout,
 * account switch, and session revoke all run clearCustomerScopedState so no
 * cart, order, address, or cached response survives into another account.
 */

import { create } from "zustand";
import type { Session } from "@gatimitra/contracts";
import { authService } from "@/services/auth.service";
import { clearCustomerScopedState } from "@/lib/clearCustomerScopedState";
import { getActiveCustomerScopeId, setActiveCustomerScopeId } from "@/lib/customerScope";

type AuthState = {
  hydrated: boolean;
  session: Session | null;
  setSession: (s: Session | null) => Promise<void>;
  hydrate: () => Promise<void>;
  logout: () => Promise<void>;
  logoutAllDevices: () => Promise<void>;
};

function customerIdOf(session: Session | null): string | null {
  const id = session?.userId?.trim();
  return id && id.length > 0 ? id : null;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  hydrated: false,
  session: null,

  setSession: async (s) => {
    if (!s) {
      await authService.clearSession();
      await clearCustomerScopedState(null);
      set({ session: null });
      return;
    }

    const incomingCustomerId = customerIdOf(s);
    const previousCustomerId = customerIdOf(get().session) ?? getActiveCustomerScopeId();
    // Token refresh for the same customer must not wipe an in-flight cart; any
    // other transition (fresh login, account switch) crosses accounts and must.
    const crossesAccountBoundary = previousCustomerId !== incomingCustomerId;

    await authService.persistSession(s);
    if (crossesAccountBoundary) {
      await clearCustomerScopedState(incomingCustomerId);
    } else {
      setActiveCustomerScopeId(incomingCustomerId);
    }
    set({ session: s });
  },

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const session = await authService.getStoredSession();
      const customerId = customerIdOf(session);
      if (!customerId) {
        // No restorable session: drop anything the last customer left behind
        // (force-close, crash, or a cleared token store).
        await clearCustomerScopedState(null);
      } else if (customerId !== getActiveCustomerScopeId()) {
        // Persisted caches belong to a different customer than the restored
        // session — a teardown that never completed. Clear before first paint.
        await clearCustomerScopedState(customerId);
      }
      set({ session, hydrated: true });
    } catch (e) {
      console.warn("[AuthStore] hydrate failed:", e);
      await clearCustomerScopedState(null);
      set({ session: null, hydrated: true });
    }
  },

  logout: async () => {
    await authService.clearSession();
    await clearCustomerScopedState(null);
    set({ session: null });
  },

  logoutAllDevices: async () => {
    try {
      await authService.logoutAllDevices();
    } catch {
      // Continue to clear local session even if API fails
    }
    await authService.clearSession();
    await clearCustomerScopedState(null);
    set({ session: null });
  },
}));
