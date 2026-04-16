import { create } from "zustand";
import {
  createInitialStoreStatusState,
  reduceStoreStatusEngine,
  UI_STRINGS,
  type StoreStatusEngineEffect,
  type StoreStatusEngineState,
} from "@/lib/storeStatusEngine";

const KEY_PREFIX = "gm_dashboard_local_store_status_engine_";
const TICK_MS = 5_000;

type EngineStore = {
  state: StoreStatusEngineState;
  hydrate: (storeKey: string) => void;
  manualOn: () => void;
  manualOff: (manualCloseReason?: string | null) => void;
  tempClose: (untilIso: string, reason?: string | null) => void;
  scheduleEndRespond: (action: "stay_online" | "go_offline") => void;
  updateConfig: (patch: Partial<StoreStatusEngineState>) => void;
  startTick: () => void;
  stopTick: () => void;
  scheduleEndModalOpen: boolean;
  openScheduleEndModal: () => void;
  closeScheduleEndModal: () => void;
};

let tickId: any = null;
let currentKey: string | null = null;

function persist(key: string, s: StoreStatusEngineState) {
  try {
    localStorage.setItem(key, JSON.stringify(s));
  } catch {
    // ignore
  }
}

function runEffects(effects: StoreStatusEngineEffect[], api: { openModal: () => void }) {
  for (const e of effects) {
    if (e.type === "schedule_end_modal") api.openModal();
  }
}

export const useLocalStoreStatusEngineStore = create<EngineStore>((set, get) => ({
  state: createInitialStoreStatusState(),
  scheduleEndModalOpen: false,
  openScheduleEndModal: () => set({ scheduleEndModalOpen: true }),
  closeScheduleEndModal: () => set({ scheduleEndModalOpen: false }),

  hydrate: (storeKey: string) => {
    currentKey = `${KEY_PREFIX}${storeKey}`;
    try {
      const raw = localStorage.getItem(currentKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as StoreStatusEngineState;
      if (parsed && (parsed.store_status === "ONLINE" || parsed.store_status === "OFFLINE")) {
        set({ state: { ...createInitialStoreStatusState(), ...parsed } });
      }
    } catch {
      // ignore
    }
  },

  manualOn: () => {
    const now = new Date();
    set((prev) => {
      const { state, effects } = reduceStoreStatusEngine(prev.state, { type: "MANUAL_ON", now });
      if (effects.some((e) => e.type === "persist") && currentKey) persist(currentKey, state);
      runEffects(effects, { openModal: get().openScheduleEndModal });
      return { state };
    });
  },

  manualOff: (manualCloseReason) => {
    const now = new Date();
    set((prev) => {
      const { state, effects } = reduceStoreStatusEngine(prev.state, {
        type: "MANUAL_OFF",
        now,
        ...(manualCloseReason != null && String(manualCloseReason).trim() !== ""
          ? { manual_close_reason: String(manualCloseReason).trim() }
          : {}),
      });
      if (effects.some((e) => e.type === "persist") && currentKey) persist(currentKey, state);
      runEffects(effects, { openModal: get().openScheduleEndModal });
      return { state };
    });
  },

  tempClose: (untilIso, reason) => {
    const now = new Date();
    set((prev) => {
      const { state, effects } = reduceStoreStatusEngine(prev.state, {
        type: "TEMP_CLOSE",
        now,
        manual_close_until: untilIso,
        manual_close_reason: reason ?? null,
      });
      if (effects.some((e) => e.type === "persist") && currentKey) persist(currentKey, state);
      return { state };
    });
  },

  scheduleEndRespond: (action) => {
    const now = new Date();
    set((prev) => {
      const { state, effects } = reduceStoreStatusEngine(prev.state, { type: "SCHEDULE_END_RESPONSE", now, action });
      if (effects.some((e) => e.type === "persist") && currentKey) persist(currentKey, state);
      return { state, scheduleEndModalOpen: false };
    });
  },

  updateConfig: (patch) => {
    const now = new Date();
    set((prev) => {
      const { state, effects } = reduceStoreStatusEngine(prev.state, { type: "CONFIG_UPDATE", now, patch });
      if (effects.some((e) => e.type === "persist") && currentKey) persist(currentKey, state);
      return { state };
    });
  },

  startTick: () => {
    if (tickId) return;
    tickId = setInterval(() => {
      const now = new Date();
      set((prev) => {
        const { state, effects } = reduceStoreStatusEngine(prev.state, { type: "TICK", now });
        if (effects.some((e) => e.type === "persist") && currentKey) persist(currentKey, state);
        runEffects(effects, { openModal: get().openScheduleEndModal });
        return { state };
      });
    }, TICK_MS);
  },

  stopTick: () => {
    if (!tickId) return;
    clearInterval(tickId);
    tickId = null;
  },
}));

export { UI_STRINGS };

