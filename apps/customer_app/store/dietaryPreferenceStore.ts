import { create } from "zustand";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  calendarDay,
  isVegStoreFilterActive,
  isVegToggleOn,
  mergeVegModePrefs,
  parseStoredVegMode,
  type VegModePrefs,
  type VegModeStoreScope,
} from "@/lib/vegMode";
import { getVegModePreference, putVegModePreference } from "@/services/vegMode.service";

export const DIETARY_PREFERENCE_STORAGE_KEY = "@gatimitra/dietary_preferences";

type DietaryPreferenceState = VegModePrefs & {
  vegOnly: boolean;
  vegToggleOn: boolean;
  hydrated: boolean;
  updatedAt?: string;
  calendarDay: number;
  setVegOnly: (value: boolean) => void;
  applyVegMode: (input: { storeScope: VegModeStoreScope; weekdays: number[] | null }) => void;
  turnOff: () => void;
  refreshCalendarDay: () => void;
  hydrate: () => Promise<void>;
  reset: () => void;
};

function derived(prefs: VegModePrefs, day: number) {
  return {
    ...prefs,
    vegToggleOn: isVegToggleOn(prefs, day),
    vegOnly: isVegStoreFilterActive(prefs, day),
  };
}

function persist(state: DietaryPreferenceState): void {
  AsyncStorage.setItem(
    DIETARY_PREFERENCE_STORAGE_KEY,
    JSON.stringify({
      enabled: state.enabled,
      storeScope: state.storeScope,
      weekdays: state.weekdays,
      updatedAt: state.updatedAt,
    })
  ).catch(() => {});
}

function pushRemote(prefs: VegModePrefs): void {
  void putVegModePreference({
    enabled: prefs.enabled,
    storeScope: prefs.storeScope,
    weekdays: prefs.weekdays,
  }).catch(() => {});
}

let dayListenerAttached = false;
let remoteSynced = false;

function attachDayListener(refresh: () => void): void {
  if (dayListenerAttached) return;
  dayListenerAttached = true;
  AppState.addEventListener("change", (status) => {
    if (status === "active") refresh();
  });
}

const DEFAULT_PREFS: VegModePrefs = {
  enabled: false,
  storeScope: "all_restaurants",
  weekdays: null,
};

/** Start disk read ASAP so Food Home rarely waits on dietary hydrate. */
let bootDiskPrefs: Promise<{
  prefs: VegModePrefs;
  updatedAt?: string;
}> | null = null;

function readDiskPrefsOnce(): Promise<{ prefs: VegModePrefs; updatedAt?: string }> {
  if (!bootDiskPrefs) {
    bootDiskPrefs = (async () => {
      try {
        const raw = await AsyncStorage.getItem(DIETARY_PREFERENCE_STORAGE_KEY);
        const localParsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
        return {
          prefs: parseStoredVegMode(localParsed),
          updatedAt:
            typeof localParsed.updatedAt === "string" && localParsed.updatedAt.length > 0
              ? localParsed.updatedAt
              : undefined,
        };
      } catch {
        return { prefs: DEFAULT_PREFS };
      }
    })();
  }
  return bootDiskPrefs;
}

void readDiskPrefsOnce();

export const useDietaryPreferenceStore = create<DietaryPreferenceState>((set, get) => ({
  ...derived(DEFAULT_PREFS, calendarDay()),
  hydrated: false,
  calendarDay: calendarDay(),

  setVegOnly: (value) => {
    if (!value) {
      get().turnOff();
      return;
    }
    get().applyVegMode({ storeScope: "pure_veg_only", weekdays: null });
  },

  applyVegMode: (input) => {
    const day = calendarDay();
    const prefs: VegModePrefs = {
      enabled: true,
      storeScope: input.storeScope,
      weekdays: input.weekdays,
    };
    const next = {
      ...get(),
      ...derived(prefs, day),
      calendarDay: day,
      updatedAt: new Date().toISOString(),
    };
    set(next);
    persist(next);
    pushRemote(prefs);
  },

  turnOff: () => {
    const day = calendarDay();
    const current = get();
    const prefs: VegModePrefs = {
      enabled: false,
      storeScope: current.storeScope,
      weekdays: current.weekdays,
    };
    const next = {
      ...current,
      ...derived(prefs, day),
      calendarDay: day,
      updatedAt: new Date().toISOString(),
    };
    set(next);
    persist(next);
    pushRemote(prefs);
  },

  refreshCalendarDay: () => {
    const day = calendarDay();
    const current = get();
    if (current.calendarDay === day) return;
    set({
      ...current,
      ...derived(current, day),
      calendarDay: day,
    });
  },

  hydrate: async () => {
    attachDayListener(() => get().refreshCalendarDay());
    const day = calendarDay();
    if (!get().hydrated) {
      try {
        const disk = await readDiskPrefsOnce();
        const local = disk.prefs;
        const hasUpdatedAt = typeof disk.updatedAt === "string" && disk.updatedAt.length > 0;
        const stampedAt =
          hasUpdatedAt
            ? disk.updatedAt
            : local.enabled === false
              ? new Date().toISOString()
              : undefined;
        const next = {
          ...get(),
          ...derived(local, day),
          calendarDay: day,
          updatedAt: stampedAt,
          hydrated: true,
        };
        set(next);
        if (!hasUpdatedAt && local.enabled === false) {
          persist(next);
          pushRemote(local);
        }
      } catch {
        set({ ...derived(DEFAULT_PREFS, day), calendarDay: day, hydrated: true });
      }
    } else {
      get().refreshCalendarDay();
    }

    if (remoteSynced) return;
    remoteSynced = true;
    try {
      const remote = await getVegModePreference();
      const current = get();
      const merged = mergeVegModePrefs(
        {
          enabled: current.enabled,
          storeScope: current.storeScope,
          weekdays: current.weekdays,
          updatedAt: current.updatedAt,
        },
        remote
      );
      const nextDay = calendarDay();
      const next = {
        ...current,
        ...derived(merged, nextDay),
        calendarDay: nextDay,
        updatedAt: merged.updatedAt,
        hydrated: true,
      };
      set(next);
      persist(next);
      if (
        current.enabled === false &&
        remote.enabled === true &&
        merged.enabled === false
      ) {
        pushRemote({
          enabled: false,
          storeScope: merged.storeScope,
          weekdays: merged.weekdays,
        });
      }
    } catch {
      remoteSynced = false;
    }
  },

  reset: () => {
    remoteSynced = false;
    bootDiskPrefs = null;
    const day = calendarDay();
    set({
      ...derived(DEFAULT_PREFS, day),
      calendarDay: day,
      hydrated: true,
      updatedAt: undefined,
    });
    AsyncStorage.removeItem(DIETARY_PREFERENCE_STORAGE_KEY).catch(() => {});
  },
}));
