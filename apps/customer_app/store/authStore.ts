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
import {
  getActiveCustomerScopeId,
  hydrateCustomerScopeFromStorage,
  setActiveCustomerScopeId,
} from "@/lib/customerScope";
import { runCustomerPushUnregister } from "@/lib/customerPushUnregister";
import { startupLaunchLog } from "@/lib/startupPerf";

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

    try {
      await authService.persistSession(s);
    } catch (e) {
      console.warn("[AuthStore] persistSession failed", e);
    }
    // Publish session first so OTP → home is not blocked (or crashed) by
    // lazily loading customer teardown stores.
    set({ session: s });
    try {
      if (crossesAccountBoundary) {
        await scopedClear(incomingCustomerId);
      } else {
        setActiveCustomerScopeId(incomingCustomerId);
      }
    } catch (e) {
      console.warn("[AuthStore] post-login scoped clear failed", e);
      setActiveCustomerScopeId(incomingCustomerId);
    }
  },

  hydrate: async () => {
    if (get().hydrated) return;
    const t0 = Date.now();
    try {
      // Scope must be disk-hydrated before compare — otherwise Expo Go cold start
      // sees scope=null and incorrectly awaits full scopedClear (multi-second Metro
      // pull of cart/location/order modules) on every launch.
      await hydrateCustomerScopeFromStorage();
      const sessionT0 = Date.now();
      const stored = await authService.getStoredSession();
      startupLaunchLog("AUTH_SESSION_READ", { durationMs: Date.now() - sessionT0 });

      if (!stored) {
        set({ session: null, hydrated: true });
        startupLaunchLog("AUTH_RESTORE_LOCAL_DONE", {
          durationMs: Date.now() - t0,
          hasSession: false,
        });
        // Background teardown — never block first paint on signed-out clear.
        void scopedClear(null);
        return;
      }

      const customerId = customerIdOf(stored);
      if (!customerId) {
        set({ session: null, hydrated: true });
        startupLaunchLog("AUTH_RESTORE_LOCAL_DONE", {
          durationMs: Date.now() - t0,
          hasSession: false,
        });
        void scopedClear(null);
        return;
      }

      const previousScope = getActiveCustomerScopeId();
      // Only a real account switch needs a blocking clear. scope=null on first
      // paint after process start is normal (memory empty) — just bind the id.
      const crossesAccount =
        previousScope != null && previousScope.length > 0 && previousScope !== customerId;

      if (crossesAccount) {
        const clearT0 = Date.now();
        await scopedClear(customerId);
        startupLaunchLog("STARTUP_BLOCKER", {
          stage: "auth_scoped_clear_account_switch",
          durationMs: Date.now() - clearT0,
        });
      } else {
        setActiveCustomerScopeId(customerId);
      }

      // Optimistic: unblock navigator immediately. Network validate stays background.
      set({ session: stored, hydrated: true });
      startupLaunchLog("AUTH_RESTORE_LOCAL_DONE", {
        durationMs: Date.now() - t0,
        hasSession: true,
        crossedAccount: crossesAccount,
      });

      void authService.validateStoredSession(stored).then((validated) => {
        if (validated) return;
        void scopedClear(null);
        set({ session: null });
      });
    } catch (e) {
      console.warn("[AuthStore] hydrate failed:", e);
      set({ session: null, hydrated: true });
      void scopedClear(null);
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
