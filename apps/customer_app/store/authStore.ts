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
/** Soft ceiling — real unblock comes from sync peek / FastKV; this is only a safety net. */
const AUTH_LOCAL_BUDGET_MS = 350;

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
/**
 * True only after a full local disk/sync restore attempt finishes.
 * Splash force-unblock must NOT skip this — that left users on Login forever
 * with a valid AsyncStorage session still unread.
 */
let authLocalRestoreDone = false;

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
    // Token refresh for the same customer must not wipe an in-flight cart.
    // Fresh login (previousCustomerId null after logout) is NOT an account
    // switch — logout already tore down scoped state. Treating null→id as a
    // switch forced await scopedClear() on every OTP and hung the verify UI
    // while Metro lazily pulled cart/location/order modules.
    const crossesAccountBoundary =
      previousCustomerId != null &&
      previousCustomerId.length > 0 &&
      previousCustomerId !== incomingCustomerId;

    if (crossesAccountBoundary && previousAccessToken) {
      // Never block OTP spinner on push unregister.
      void runCustomerPushUnregister(previousAccessToken);
    }

    // Publish session first so OTP can navigate immediately.
    set({ session: s, sessionRestorePending: false });
    setActiveCustomerScopeId(incomingCustomerId);
    // Durability: await AsyncStorage session JSON (cold-start source of truth in
    // Expo Go). SecureStore token write stays backgrounded — it is slow and the
    // API interceptor prefers the in-memory token.
    try {
      await authService.persistSessionDurable(s);
    } catch (e) {
      console.warn("[AuthStore] persistSessionDurable failed", e);
    }
    void authService.persistSessionToken(s).catch((e) => {
      console.warn("[AuthStore] persistSessionToken failed", e);
    });
    if (crossesAccountBoundary) {
      // Never await teardown on the OTP critical path — background it.
      void scopedClear(incomingCustomerId).catch((e) => {
        console.warn("[AuthStore] post-login scoped clear failed", e);
        setActiveCustomerScopeId(incomingCustomerId);
      });
    }
  },

  forceSplashUnblock: () => {
    // Fast Refresh can wipe the zustand session while leaving module flags set.
    // If we have no session, always require a disk restore before Login.
    if (!get().session?.accessToken) {
      authLocalRestoreDone = false;
    }
    // Hydrate runs sync-peek synchronously until the first await — returning
    // users get session+pending:false in this same turn (no splash hold).
    void get().hydrate();
    const hasSession = Boolean(get().session?.accessToken);
    const pending = !hasSession && !authLocalRestoreDone;
    set({
      hydrated: true,
      sessionRestorePending: pending,
    });
    startupLaunchLog("AUTH_RESTORE_FORCE_UNBLOCK", {
      blocksHome: true,
      pending,
      inFlight: authHydrateInFlight != null,
      localRestoreDone: authLocalRestoreDone,
      hasSession,
    });
  },

  hydrate: async () => {
    if (authHydrateInFlight) return authHydrateInFlight;
    // Only skip when a full local restore already finished. Splash force-unblock
    // sets hydrated=true early — that must NOT skip AsyncStorage session read.
    if (authLocalRestoreDone && !get().sessionRestorePending) {
      return;
    }
    authHydrateInFlight = (async () => {
      const t0 = Date.now();
      let budgetTimer: ReturnType<typeof setTimeout> | null = null;

      const markBudgetUnblock = () => {
        // Unblock navigator under splash, but keep pending until disk finishes.
        set({
          hydrated: true,
          sessionRestorePending: !get().session?.accessToken && !authLocalRestoreDone,
        });
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
            authLocalRestoreDone = true;
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

        // Session disk read is the splash critical path. Scope hydrate can race —
        // awaiting it first held branding for multi-second AsyncStorage stalls.
        const sessionT0 = Date.now();
        const [, stored] = await Promise.all([
          hydrateCustomerScopeFromStorage().catch(() => undefined),
          authService.getStoredSession(),
        ]);
        startupLaunchLog("AUTH_SESSION_READ", {
          durationMs: Date.now() - sessionT0,
          blocksHome: true,
        });

        if (!stored) {
          authLocalRestoreDone = true;
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
          authLocalRestoreDone = true;
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
        // Only a real account switch needs teardown. scope=null on first paint
        // after process start is normal — just bind the id.
        const crossesAccount =
          previousScope != null && previousScope.length > 0 && previousScope !== customerId;

        // Publish session BEFORE account-switch clear — never hold splash on
        // Metro lazily pulling cart/location/order modules.
        setActiveCustomerScopeId(customerId);
        authLocalRestoreDone = true;
        set({ session: stored, hydrated: true, sessionRestorePending: false });
        startupLaunchLog("AUTH_RESTORE_LOCAL_DONE", {
          durationMs: Date.now() - t0,
          hasSession: true,
          crossedAccount: crossesAccount,
          blocksHome: true,
        });
        if (crossesAccount) {
          void scopedClear(customerId).catch((e) => {
            console.warn("[AuthStore] hydrate scoped clear failed", e);
            setActiveCustomerScopeId(customerId);
          });
        }

        startupLaunchLog("AUTH_REMOTE_VALIDATE_START", { blocksHome: false });
        const remoteT0 = Date.now();
        const validatedToken = stored.accessToken;
        void authService.validateStoredSession(stored).then((validated) => {
          startupLaunchLog("AUTH_REMOTE_VALIDATE_DONE", {
            durationMs: Date.now() - remoteT0,
            ok: Boolean(validated),
            blocksHome: false,
          });
          if (validated) return;
          // OTP may have published a newer session while this stale hydrate
          // validate was in flight — never wipe a token we did not probe.
          if (get().session?.accessToken !== validatedToken) return;
          void scopedClear(null);
          set({ session: null });
        });
      } catch (e) {
        console.warn("[AuthStore] hydrate failed:", e);
        authLocalRestoreDone = true;
        set({ session: null, hydrated: true, sessionRestorePending: false });
        void scopedClear(null);
      } finally {
        if (budgetTimer) clearTimeout(budgetTimer);
        if (get().sessionRestorePending && authLocalRestoreDone) {
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
