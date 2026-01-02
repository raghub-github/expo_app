import { create } from "zustand";
import { getItem, setItem } from "@/src/utils/storage";

const DUTY_STORE_KEY = "rider_duty_status";

interface DutyStoreState {
  isOnDuty: boolean;
  hydrated: boolean;
  setDutyStatus: (status: boolean) => Promise<void>;
  toggleDuty: () => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useDutyStore = create<DutyStoreState>((set, get) => ({
  isOnDuty: false,
  hydrated: false,

  setDutyStatus: async (status: boolean) => {
    set({ isOnDuty: status });
    await setItem(DUTY_STORE_KEY, JSON.stringify(status));
    // TODO: Sync with backend API
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
}));

