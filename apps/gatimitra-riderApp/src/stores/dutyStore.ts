import { create } from "zustand";
import { getItem, setItem } from "@/src/utils/storage";
import { riderApi } from "@/src/services/api/riderApi";
import { useSessionStore } from "@/src/stores/sessionStore";
import {
  dutyPhaseFromServerFlag,
  dutySyncRetryDelayMs,
  isDutyDispatchAuthorized,
  type DutySyncPhase,
} from "@/src/lib/dutySyncAuthority";
import { isRiderNetworkOnline, subscribeRiderNetworkRestored } from "@/src/stores/riderNetworkStore";

const DUTY_STORE_KEY = "rider_duty_status";

interface DutyStoreState {
  /** UI / cached display — may be stale until syncPhase is server_*. */
  isOnDuty: boolean;
  /** Authoritative sync machine — gates dispatch / WS / duty GPS. */
  syncPhase: DutySyncPhase;
  hydrated: boolean;
  /** Shared across header pill + bottom Turn On — any duty action in flight. */
  actionBusy: boolean;
  setActionBusy: (busy: boolean) => void;
  /**
   * Persist local duty flag. Pass `source: "server"` after backend confirmation
   * so syncPhase becomes server_on/off. Cache/local writes never authorize dispatch.
   */
  setDutyStatus: (
    status: boolean,
    opts?: { source?: "server" | "local" }
  ) => Promise<void>;
  toggleDuty: () => Promise<void>;
  hydrate: () => Promise<void>;
  /** Align local duty with backend duty_logs (required before dispatch). */
  syncFromServer: () => Promise<void>;
}

let syncInFlight: Promise<void> | null = null;
let syncRetryTimer: ReturnType<typeof setTimeout> | null = null;
let syncRetryAttempt = 0;
let netRetryWired = false;
/** Avoid flooding Metro while backend is briefly down. */
let lastDutySyncFailLogAt = 0;

function clearSyncRetryTimer() {
  if (syncRetryTimer) {
    clearTimeout(syncRetryTimer);
    syncRetryTimer = null;
  }
}

function scheduleSyncRetry() {
  clearSyncRetryTimer();
  const delay = dutySyncRetryDelayMs(syncRetryAttempt);
  syncRetryAttempt += 1;
  syncRetryTimer = setTimeout(() => {
    syncRetryTimer = null;
    if (!useSessionStore.getState().session?.accessToken) return;
    if (!isRiderNetworkOnline()) return;
    void useDutyStore.getState().syncFromServer();
  }, delay);
}

function ensureNetRetryWire() {
  if (netRetryWired) return;
  netRetryWired = true;
  subscribeRiderNetworkRestored(() => {
    const phase = useDutyStore.getState().syncPhase;
    if (phase === "sync_failed" || phase === "unknown" || phase === "syncing") {
      syncRetryAttempt = 0;
      void useDutyStore.getState().syncFromServer();
    }
  });
}

export const useDutyStore = create<DutyStoreState>((set, get) => ({
  isOnDuty: false,
  syncPhase: "unknown",
  hydrated: false,
  actionBusy: false,

  setActionBusy: (busy) => set({ actionBusy: busy }),

  setDutyStatus: async (status: boolean, opts) => {
    const source = opts?.source ?? "server";
    if (source === "server") {
      syncRetryAttempt = 0;
      clearSyncRetryTimer();
      set({
        isOnDuty: status,
        syncPhase: dutyPhaseFromServerFlag(status),
      });
    } else {
      // Local/cache write: update UI only — never promote to server_on.
      set({ isOnDuty: status });
    }
    await setItem(DUTY_STORE_KEY, JSON.stringify(status));
  },

  toggleDuty: async () => {
    const current = get().isOnDuty;
    await get().setDutyStatus(!current, { source: "local" });
  },

  hydrate: async () => {
    try {
      const stored = await getItem(DUTY_STORE_KEY);
      const phase = get().syncPhase;
      // Never downgrade a verified server_on/off on re-hydrate (Fast Refresh / remount).
      const keepServerPhase = phase === "server_on" || phase === "server_off";
      if (stored) {
        const status = JSON.parse(stored) === true;
        if (keepServerPhase) {
          set({ isOnDuty: status });
        } else {
          // Cached UI only — stay unknown until syncFromServer confirms.
          set({ isOnDuty: status, syncPhase: "unknown" });
        }
      } else if (!keepServerPhase) {
        set({ syncPhase: "unknown" });
      }
    } catch (error) {
      console.warn("Error hydrating duty store (non-critical):", error);
      if (get().syncPhase !== "server_on" && get().syncPhase !== "server_off") {
        set({ syncPhase: "unknown" });
      }
    } finally {
      set({ hydrated: true });
    }
  },

  syncFromServer: async () => {
    const session = useSessionStore.getState().session;
    if (!session?.accessToken) return;
    ensureNetRetryWire();

    if (syncInFlight) return syncInFlight;

    // Keep server_on/off while refreshing — demoting to "syncing" stops WS/dispatch every poll.
    const phaseBefore = get().syncPhase;
    if (phaseBefore !== "server_on" && phaseBefore !== "server_off") {
      set({ syncPhase: "syncing" });
    }

    syncInFlight = (async () => {
      try {
        const status = await riderApi.getDutyStatus();
        await get().setDutyStatus(status.isOnDuty, { source: "server" });
        syncRetryAttempt = 0;
        clearSyncRetryTimer();
      } catch {
        try {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          const status = await riderApi.getDutyStatus();
          await get().setDutyStatus(status.isOnDuty, { source: "server" });
          syncRetryAttempt = 0;
          clearSyncRetryTimer();
        } catch (error) {
          const now = Date.now();
          if (__DEV__ && now - lastDutySyncFailLogAt > 20_000) {
            lastDutySyncFailLogAt = now;
            console.warn(
              "[DutyStore] Server duty sync failed — dispatch stays gated:",
              error instanceof Error ? error.message : error
            );
          }
          // Confirmed server_* stays until we know sync failed cold; only fail unverified phases.
          const still = get().syncPhase;
          if (still === "server_on" || still === "server_off") {
            // Soft fail: keep dispatch live; retry in background.
            scheduleSyncRetry();
          } else {
            set({ syncPhase: "sync_failed" });
            scheduleSyncRetry();
          }
        }
      } finally {
        syncInFlight = null;
      }
    })();

    return syncInFlight;
  },
}));

/** Process-wide: may start dispatch / WS / duty GPS. */
export function isRiderDutyDispatchAuthorized(): boolean {
  return isDutyDispatchAuthorized(useDutyStore.getState().syncPhase);
}

/** Test helper */
export function _resetDutySyncRetryForTests(): void {
  clearSyncRetryTimer();
  syncRetryAttempt = 0;
  syncInFlight = null;
}
