import { create } from "zustand";
import { getItem, setItem } from "@/src/utils/storage";
import {
  isRiderServiceTypeValue,
  type RiderServiceFilter,
} from "@/src/lib/rider-duty-service-types";
import type { RiderServiceTypeValue } from "@/src/lib/rider-vehicle-form";

const STORE_KEY = "rider_service_filter_v2";
const LEGACY_STORE_KEY = "rider_service_filter";

interface RiderServiceFilterState {
  selectedServices: RiderServiceTypeValue[];
  hydrated: boolean;
  setSelectedServices: (services: RiderServiceTypeValue[]) => Promise<void>;
  hydrate: () => Promise<void>;
}

function parseStoredServices(raw: string | null): RiderServiceTypeValue[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const services = parsed.filter(
      (item): item is RiderServiceTypeValue =>
        typeof item === "string" && isRiderServiceTypeValue(item),
    );
    return services.length > 0 ? services : null;
  } catch {
    return null;
  }
}

export const useRiderServiceFilterStore = create<RiderServiceFilterState>((set, get) => ({
  selectedServices: [],
  hydrated: false,

  setSelectedServices: async (services) => {
    set({ selectedServices: services });
    await setItem(STORE_KEY, JSON.stringify(services));
  },

  hydrate: async () => {
    try {
      const storedV2 = await getItem(STORE_KEY);
      const fromV2 = parseStoredServices(storedV2);
      if (fromV2) {
        set({ selectedServices: fromV2 });
        return;
      }

      const legacy = await getItem(LEGACY_STORE_KEY);
      if (
        legacy === "all" ||
        legacy === "food" ||
        legacy === "parcel" ||
        legacy === "person_ride"
      ) {
        set({
          selectedServices:
            legacy === "all"
              ? []
              : isRiderServiceTypeValue(legacy)
                ? [legacy]
                : [],
        });
      }
    } catch (error) {
      console.warn("[RiderServiceFilterStore] hydrate failed:", error);
    } finally {
      set({ hydrated: true });
    }
  },
}));

export type { RiderServiceFilter };
