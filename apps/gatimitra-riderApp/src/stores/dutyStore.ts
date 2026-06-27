import { create } from "zustand";
import { getItem, setItem } from "@/src/utils/storage";
import { riderApi } from "@/src/services/api/riderApi";
import { useSessionStore } from "@/src/stores/sessionStore";

const DUTY_STORE_KEY = "rider_duty_status";

interface DutyStoreState {
  isOnDuty: boolean;
  hydrated: boolean;
  setDutyStatus: (status: boolean) => Promise<void>;
  toggleDuty: () => Promise<void>;
  hydrate: () => Promise<void>;
  /** Align local duty with backend duty_logs (required for dispatch offers). */
  syncFromServer: () => Promise<void>;
}

export const useDutyStore = create<DutyStoreState>((set, get) => ({
  isOnDuty: false,
  hydrated: false,

  setDutyStatus: async (status: boolean) => {
    set({ isOnDuty: status });
    await setItem(DUTY_STORE_KEY, JSON.stringify(status));
  },

  toggleDuty: async () => {
    const current = get().isOnDuty;
    await get().setDutyStatus(!current);
  },

  hydrate: async () => {
    try {
      const stored = await getItem(DUTY_STORE_KEY);
      if (stored) {
        const status = JSON.parse(stored) === true;
        set({ isOnDuty: status });
      }
    } catch (error) {
      console.warn("Error hydrating duty store (non-critical):", error);
    } finally {
      set({ hydrated: true });
    }
  },

  syncFromServer: async () => {
    const session = useSessionStore.getState().session;
    if (!session?.accessToken) return;
    try {
      const status = await riderApi.getDutyStatus();
      await get().setDutyStatus(status.isOnDuty);
    } catch (error) {
      console.warn("[DutyStore] Server duty sync failed (using local state):", error);
    }
  },
}));
