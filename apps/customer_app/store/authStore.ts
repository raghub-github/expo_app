/**
 * Auth global state - session, hydration, login/logout.
 * Hydrate on app start to support auto-login.
 *
 * Every session transition is a customer-isolation boundary: login, logout,
 * account switch, and session revoke all run customer-scoped teardown so no
 * cart, order, address, or cached response survives into another account.
 */

import { create } from "zustand";
import type { Session } from "@gatimitra/contracts";
import { authService } from "@/services/auth.service";
import { getActiveCustomerScopeId, setActiveCustomerScopeId } from "@/lib/customerScope";
import { runCustomerPushUnregister } from "@/lib/customerPushUnregister";

async function scopedClear(customerId: string | null): Promise<void> {
  // Lazy — a static import pulled cart/location stores before authStore
  // finished initializing (boot crash loop).
  const mod = require("@/lib/clearCustomerScopedState") as typeof import("@/lib/clearCustomerScopedState");
  await mod.clearCustomerScopedState(customerId);
}

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
      await scopedClear(null);
      set({ session: null });
      return;
    }

    const incomingCustomerId = customerIdOf(s);
    const previousCustomerId = customerIdOf(get().session) ?? getActiveCustomerScopeId();
    const previousAccessToken = get().session?.accessToken ?? null;
    // Token refresh for the same customer must not wipe an in-flight cart; any
    // other transition (fresh login, account switch) crosses accounts and must.
    const crossesAccountBoundary = previousCustomerId !== incomingCustomerId;

    if (crossesAccountBoundary && previousAccessToken) {
      await runCustomerPushUnregister(previousAccessToken);
    }

    await authService.persistSession(s);
    if (crossesAccountBoundary) {
      await scopedClear(incomingCustomerId);
    } else {
      setActiveCustomerScopeId(incomingCustomerId);
    }
    set({ session: s });
  },

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const stored = await authService.getStoredSession();
      if (!stored) {
        await scopedClear(null);
        set({ session: null, hydrated: true });
        return;
      }

      const customerId = customerIdOf(stored);
      if (!customerId) {
        await scopedClear(null);
        set({ session: null, hydrated: true });
        return;
      }
      if (customerId !== getActiveCustomerScopeId()) {
        await scopedClear(customerId);
      } else {
        setActiveCustomerScopeId(customerId);
      }

      // Optimistic: unblock first paint immediately with the stored session,
      // validate against the backend in the background instead of gating
      // hydrated (and therefore the whole app's first screen) behind a live
      // network round trip (up to 12s on a slow connection). Every API call
      // already enforces auth per-request (401/403 on a bad token), so this
      // check is a UX guard against showing authenticated screens on a
      // forged/revoked token, not the only line of defense — it still runs,
      // just without blocking the first frame. A definitive 401/403 clears
      // the session below, same outcome as before, a couple seconds later.
      set({ session: stored, hydrated: true });
      void authService.validateStoredSession(stored).then((validated) => {
        if (validated) return;
        void scopedClear(null);
        set({ session: null });
      });
    } catch (e) {
      console.warn("[AuthStore] hydrate failed:", e);
      await scopedClear(null);
      set({ session: null, hydrated: true });
    }
  },

  logout: async () => {
    const accessToken = get().session?.accessToken ?? null;
    await runCustomerPushUnregister(accessToken);
    await authService.clearSession();
    await scopedClear(null);
    set({ session: null });
  },

  logoutAllDevices: async () => {
    const accessToken = get().session?.accessToken ?? null;
    try {
      await authService.logoutAllDevices();
    } catch {
      // Continue to clear local session even if API fails
    }
    await runCustomerPushUnregister(accessToken);
    await authService.clearSession();
    await scopedClear(null);
    set({ session: null });
  },
}));
