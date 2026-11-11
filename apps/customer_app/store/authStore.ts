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

/**
 * Hard ceiling for local session restore on the splash critical path.
 * AsyncStorage/SecureStore + Metro can stall 15–60s in Expo Go — never hold
 * branding that long. Background restore continues after this budget.
 */
const AUTH_LOCAL_BUDGET_MS = 1_200;

async function scopedClear(customerId: string | null): Promise<void> {
  // Lazy — a static import pulled cart/location stores before authStore
  // finished initializing (boot crash loop).
  const mod = require("@/lib/clearCustomerScopedState") as typeof import("@/lib/clearCustomerScopedState");
  await mod.clearCustomerScopedState(customerId);
}

type AuthState = {
  hydrated: boolean;
  /**
   * True while disk session read is still running after splash-budget unblock.
   * Index / AuthGate must not redirect to login until this clears.
   */
  sessionRestorePending: boolean;
  session: Session | null;
  setSession: (s: Session | null) => Promise<void>;
  hydrate: () => Promise<void>;
  /** Absolute splash deadline — unblock navigator even if storage is wedged. */
  forceSplashUnblock: () => void;
  logout: () => Promise<void>;
  logoutAllDevices: () => Promise<void>;
};

function customerIdOf(session: Session | null): string | null {
  const id = session?.userId?.trim();
  return id && id.length > 0 ? id : null;
}

/** Prevent concurrent hydrate() callers from double-reading SecureStore/AsyncStorage. */
let authHydrateInFlight: Promise<void> | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  hydrated: false,
  sessionRestorePending: false,
  session: null,

  setSession: async (s) => {
    if (!s) {
      await authService.clearSession();
      await scopedClear(null);
      set({ session: null, sessionRestorePending: false });
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
    set({ session: s, sessionRestorePending: false });
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

  forceSplashUnblock: () => {
    if (get().hydrated) return;
    set({
      hydrated: true,
      sessionRestorePending: authHydrateInFlight != null,
    });
    startupLaunchLog("AUTH_RESTORE_FORCE_UNBLOCK", {
      blocksHome: true,
      pending: authHydrateInFlight != null,
    });
  },

  hydrate: async () => {
    if (get().hydrated && !get().sessionRestorePending && !authHydrateInFlight) {
      return;
    }
    if (authHydrateInFlight) return authHydrateInFlight;
    authHydrateInFlight = (async () => {
      const t0 = Date.now();
      let budgetTimer: ReturnType<typeof setTimeout> | null = null;

      const markBudgetUnblock = () => {
        if (get().hydrated) return;
        set({ hydrated: true, sessionRestorePending: true });
        startupLaunchLog("AUTH_RESTORE_BUDGET", {
          durationMs: Date.now() - t0,
          budgetMs: AUTH_LOCAL_BUDGET_MS,
          blocksHome: true,
        });
      };

      try {
        // Sync peek — next-launch MMKV/memory path; zero AsyncStorage wait.
        const syncPeek = authService.peekStoredSessionSync();
        if (syncPeek) {
          const customerId = customerIdOf(syncPeek);
          if (customerId) {
            const previousScope = getActiveCustomerScopeId();
            const crossesAccount =
              previousScope != null &&
              previousScope.length > 0 &&
              previousScope !== customerId;
            if (!crossesAccount) {
              setActiveCustomerScopeId(customerId);
            }
            set({
              session: syncPeek,
              hydrated: true,
              sessionRestorePending: false,
            });
            startupLaunchLog("AUTH_RESTORE_LOCAL_DONE", {
              durationMs: Date.now() - t0,
              hasSession: true,
              path: "sync_peek",
              blocksHome: true,
            });
            // Scope + account-switch clear + remote validate stay off splash path.
            void (async () => {
              await hydrateCustomerScopeFromStorage();
              if (crossesAccount) {
                await scopedClear(customerId);
              }
              const validated = await authService.validateStoredSession(syncPeek);
              if (!validated) {
                await scopedClear(null);
                set({ session: null });
              }
            })();
            return;
          }
        }

        budgetTimer = setTimeout(markBudgetUnblock, AUTH_LOCAL_BUDGET_MS);

        // Scope must be disk-hydrated before compare — otherwise Expo Go cold start
        // sees scope=null and incorrectly awaits full scopedClear (multi-second Metro
        // pull of cart/location/order modules) on every launch.
        await hydrateCustomerScopeFromStorage();
        const sessionT0 = Date.now();
        const stored = await authService.getStoredSession();
        startupLaunchLog("AUTH_SESSION_READ", {
          durationMs: Date.now() - sessionT0,
          blocksHome: true,
        });

        if (!stored) {
          set({ session: null, hydrated: true, sessionRestorePending: false });
          startupLaunchLog("AUTH_RESTORE_LOCAL_DONE", {
            durationMs: Date.now() - t0,
            hasSession: false,
            blocksHome: true,
          });
          // Background teardown — never block first paint on signed-out clear.
          void scopedClear(null);
          return;
        }

        const customerId = customerIdOf(stored);
        if (!customerId) {
          set({ session: null, hydrated: true, sessionRestorePending: false });
          startupLaunchLog("AUTH_RESTORE_LOCAL_DONE", {
            durationMs: Date.now() - t0,
            hasSession: false,
            blocksHome: true,
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
            blocksHome: true,
          });
        } else {
          setActiveCustomerScopeId(customerId);
        }

        // Optimistic: unblock navigator immediately. Network validate stays background.
        set({ session: stored, hydrated: true, sessionRestorePending: false });
        startupLaunchLog("AUTH_RESTORE_LOCAL_DONE", {
          durationMs: Date.now() - t0,
          hasSession: true,
          crossedAccount: crossesAccount,
          blocksHome: true,
        });

        startupLaunchLog("AUTH_REMOTE_VALIDATE_START", { blocksHome: false });
        const remoteT0 = Date.now();
        void authService.validateStoredSession(stored).then((validated) => {
          startupLaunchLog("AUTH_REMOTE_VALIDATE_DONE", {
            durationMs: Date.now() - remoteT0,
            ok: Boolean(validated),
            blocksHome: false,
          });
          if (validated) return;
          void scopedClear(null);
          set({ session: null });
        });
      } catch (e) {
        console.warn("[AuthStore] hydrate failed:", e);
        set({ session: null, hydrated: true, sessionRestorePending: false });
        void scopedClear(null);
      } finally {
        if (budgetTimer) clearTimeout(budgetTimer);
        if (get().sessionRestorePending) {
          set({ sessionRestorePending: false });
        }
      }
    })().finally(() => {
      authHydrateInFlight = null;
    });
    return authHydrateInFlight;
  },

  logout: async () => {
    const accessToken = get().session?.accessToken ?? null;
    await runCustomerPushUnregister(accessToken);
    await authService.clearSession();
    await scopedClear(null);
    set({ session: null, sessionRestorePending: false });
  },

  logoutAllDevices: async () => {
    const accessToken = get().session?.accessToken ?? null;
    try {
      await authService.logoutAllDevices();
    } catch (e) {
      console.warn("[AuthStore] logoutAllDevices failed", e);
    }
    await runCustomerPushUnregister(accessToken);
    await authService.clearSession();
    await scopedClear(null);
    set({ session: null, sessionRestorePending: false });
  },
}));
