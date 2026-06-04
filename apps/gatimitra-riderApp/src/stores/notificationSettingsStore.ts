import { create } from "zustand";
import { getItem, setItem } from "@/src/utils/storage";

const STORAGE_KEY = "rider_notification_prefs_v1";

export type RiderNotificationPrefs = {
  pushEnabled: boolean;
  newOrders: boolean;
  orderUpdates: boolean;
  earnings: boolean;
  accountAlerts: boolean;
  offers: boolean;
};

const DEFAULT_PREFS: RiderNotificationPrefs = {
  pushEnabled: true,
  newOrders: true,
  orderUpdates: true,
  earnings: true,
  accountAlerts: true,
  offers: true,
};

type NotificationSettingsStore = {
  prefs: RiderNotificationPrefs;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setPref: <K extends keyof RiderNotificationPrefs>(key: K, value: RiderNotificationPrefs[K]) => Promise<void>;
  setPrefs: (patch: Partial<RiderNotificationPrefs>) => Promise<void>;
};

async function persist(prefs: RiderNotificationPrefs) {
  await setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export const useNotificationSettingsStore = create<NotificationSettingsStore>((set, get) => ({
  prefs: DEFAULT_PREFS,
  hydrated: false,

  hydrate: async () => {
    try {
      const raw = await getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<RiderNotificationPrefs>;
        set({
          prefs: { ...DEFAULT_PREFS, ...parsed },
          hydrated: true,
        });
        return;
      }
    } catch (e) {
      console.warn("[NotificationSettingsStore] hydrate failed:", e);
    }
    set({ prefs: DEFAULT_PREFS, hydrated: true });
  },

  setPref: async (key, value) => {
    const next = { ...get().prefs, [key]: value };
    set({ prefs: next });
    await persist(next);
  },

  setPrefs: async (patch) => {
    const next = { ...get().prefs, ...patch };
    set({ prefs: next });
    await persist(next);
  },
}));
