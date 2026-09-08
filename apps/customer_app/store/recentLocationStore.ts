/**
 * Recent locations + last ride/parcel pickup/drop + recent/favorite journeys.
 * Recents stay on-device. Favorite journeys also upsert to /v1/me/saved-places.
 */

import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { savedPlacesService } from "@/services/savedPlaces.service";

const MAX_RECENT = 20;
const MAX_JOURNEYS = 12;
/** Recents older than this drop from the row; last completed ride stays as fallback. */
export const JOURNEY_TTL_MS = 24 * 60 * 60 * 1000;
const STORAGE_KEY = "gm.recentLocations.v1";
const JOURNEY_STORAGE_KEY = "gm.recentRideJourneys.v1";
const FAV_JOURNEY_STORAGE_KEY = "gm.favoriteRideJourneys.v1";
const PARCEL_JOURNEY_STORAGE_KEY = "gm.recentParcelJourneys.v1";
const FAV_PARCEL_JOURNEY_STORAGE_KEY = "gm.favoriteParcelJourneys.v1";
const LAST_RIDE_JOURNEY_KEY = "gm.lastCompletedRideJourney.v1";
const LAST_PARCEL_JOURNEY_KEY = "gm.lastCompletedParcelJourney.v1";

export type JourneyKind = "ride" | "parcel";

export type RecentLocationItem = {
  latitude: number;
  longitude: number;
  primary: string;
  fullAddress?: string;
  kind?: "pickup" | "drop" | "general";
};

export type RideJourney = {
  pickup: RecentLocationItem;
  drop: RecentLocationItem;
  savedAt: number;
  kind?: JourneyKind;
  /** True only for a delivered person-ride snapshot — not a search recent. */
  fromCompletedRide?: boolean;
};

function locationKey(lat: number, lng: number, primary: string): string {
  const rlat = Math.round(lat * 1000) / 1000;
  const rlng = Math.round(lng * 1000) / 1000;
  return `${rlat},${rlng},${(primary ?? "").slice(0, 40)}`;
}

export function journeyKey(pickup: RecentLocationItem, drop: RecentLocationItem): string {
  return `${locationKey(pickup.latitude, pickup.longitude, pickup.primary)}=>${locationKey(drop.latitude, drop.longitude, drop.primary)}`;
}

export function isJourneyFresh(journey: RideJourney, now = Date.now()): boolean {
  const savedAt = Number(journey?.savedAt);
  return Number.isFinite(savedAt) && savedAt > 0 && now - savedAt < JOURNEY_TTL_MS;
}

function parseOneJourney(raw: string | null, kind: JourneyKind): RideJourney | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as RideJourney;
    if (!isValidPlace(parsed?.pickup) || !isValidPlace(parsed?.drop)) return null;
    return { ...parsed, kind: parsed.kind ?? kind };
  } catch {
    return null;
  }
}

/**
 * Fresh recents (24h). If none remain, show the last completed ride as a
 * single fallback card — Clear is disabled in that state.
 */
export function visibleRecentJourneys(
  recents: RideJourney[],
  lastCompleted: RideJourney | null,
  now = Date.now()
): { journeys: RideJourney[]; clearEnabled: boolean } {
  const fresh = recents.filter((j) => isJourneyFresh(j, now));
  if (fresh.length > 0) return { journeys: fresh, clearEnabled: true };
  if (lastCompleted && lastCompleted.fromCompletedRide && isValidPlace(lastCompleted.pickup) && isValidPlace(lastCompleted.drop)) {
    return { journeys: [lastCompleted], clearEnabled: false };
  }
  return { journeys: [], clearEnabled: false };
}

export function placeCode(primary: string): string {
  const cleaned = primary.replace(/[^A-Za-z0-9]/g, " ").trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "LOC";
  if (parts[0]!.length >= 3) return parts[0]!.slice(0, 3).toUpperCase();
  return parts.slice(0, 2).join("").slice(0, 3).toUpperCase() || "LOC";
}

function isValidPlace(place: RecentLocationItem | null | undefined): place is RecentLocationItem {
  return (
    !!place &&
    Number.isFinite(place.latitude) &&
    Number.isFinite(place.longitude) &&
    String(place.primary ?? "").trim().length > 0
  );
}

type RecentLocationState = {
  items: RecentLocationItem[];
  lastPickup: RecentLocationItem | null;
  lastDrop: RecentLocationItem | null;
  recentJourneys: RideJourney[];
  favoriteJourneys: RideJourney[];
  recentParcelJourneys: RideJourney[];
  favoriteParcelJourneys: RideJourney[];
  lastCompletedRideJourney: RideJourney | null;
  lastCompletedParcelJourney: RideJourney | null;
  hydrated: boolean;
  addRecentLocation: (place: RecentLocationItem) => void;
  setLastRidePickup: (place: RecentLocationItem) => void;
  setLastRideDrop: (place: RecentLocationItem) => void;
  rememberRideJourney: (pickup: RecentLocationItem, drop: RecentLocationItem) => void;
  rememberParcelJourney: (pickup: RecentLocationItem, drop: RecentLocationItem) => void;
  setLastCompletedRideJourney: (pickup: RecentLocationItem, drop: RecentLocationItem) => void;
  setLastCompletedParcelJourney: (pickup: RecentLocationItem, drop: RecentLocationItem) => void;
  toggleFavoriteJourney: (journey: RideJourney) => void;
  isFavoriteJourney: (pickup: RecentLocationItem, drop: RecentLocationItem, kind?: JourneyKind) => boolean;
  mergeFavoriteJourneysFromServer: (kind: JourneyKind, journeys: RideJourney[]) => void;
  clearRecentRideJourneys: () => void;
  clearRecentParcelJourneys: () => void;
  pruneExpiredJourneys: () => void;
  clearRecentLocations: () => void;
  getRecentLocationKeys: () => Set<string>;
  hydrate: () => Promise<void>;
};

async function persistPlaces(state: Pick<RecentLocationState, "items" | "lastPickup" | "lastDrop">) {
  try {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        items: state.items,
        lastPickup: state.lastPickup,
        lastDrop: state.lastDrop,
      })
    );
  } catch {
    /* tolerated */
  }
}

async function persistList(key: string, journeys: RideJourney[]) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(journeys));
  } catch {
    /* tolerated */
  }
}

async function persistLast(key: string, journey: RideJourney | null) {
  try {
    if (!journey) {
      await AsyncStorage.removeItem(key);
      return;
    }
    await AsyncStorage.setItem(key, JSON.stringify(journey));
  } catch {
    /* tolerated */
  }
}

function parseJourneys(raw: string | null, kind: JourneyKind): RideJourney[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as RideJourney[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((j) => isValidPlace(j?.pickup) && isValidPlace(j?.drop))
      .map((j) => ({ ...j, kind: j.kind ?? kind }))
      .slice(0, MAX_JOURNEYS);
  } catch {
    return [];
  }
}

function rememberInto(
  list: RideJourney[],
  pickup: RecentLocationItem,
  drop: RecentLocationItem,
  kind: JourneyKind
): RideJourney[] {
  const key = journeyKey(pickup, drop);
  return [
    { pickup, drop, savedAt: Date.now(), kind },
    ...list.filter((j) => journeyKey(j.pickup, j.drop) !== key),
  ].slice(0, MAX_JOURNEYS);
}

function toggleFavList(list: RideJourney[], journey: RideJourney, kind: JourneyKind): RideJourney[] {
  const key = journeyKey(journey.pickup, journey.drop);
  const exists = list.some((j) => journeyKey(j.pickup, j.drop) === key);
  if (exists) {
    savedPlacesService.deleteJourney({
      serviceKind: kind,
      pickup: journey.pickup,
      drop: journey.drop,
    });
    return list.filter((j) => journeyKey(j.pickup, j.drop) !== key);
  }
  const nextItem: RideJourney = { ...journey, kind, savedAt: Date.now() };
  savedPlacesService.upsertJourney({
    serviceKind: kind,
    pickup: nextItem.pickup,
    drop: nextItem.drop,
  });
  return [nextItem, ...list].slice(0, MAX_JOURNEYS);
}

export const useRecentLocationStore = create<RecentLocationState>((set, get) => ({
  items: [],
  lastPickup: null,
  lastDrop: null,
  recentJourneys: [],
  favoriteJourneys: [],
  recentParcelJourneys: [],
  favoriteParcelJourneys: [],
  lastCompletedRideJourney: null,
  lastCompletedParcelJourney: null,
  hydrated: false,

  addRecentLocation: (place) => {
    const key = locationKey(place.latitude, place.longitude, place.primary);
    set((state) => {
      const next = [
        { ...place, kind: place.kind ?? "general" },
        ...state.items.filter((i) => locationKey(i.latitude, i.longitude, i.primary) !== key),
      ].slice(0, MAX_RECENT);
      void persistPlaces({ items: next, lastPickup: state.lastPickup, lastDrop: state.lastDrop });
      return { items: next };
    });
  },

  setLastRidePickup: (place) => {
    set((state) => {
      const item = { ...place, kind: "pickup" as const };
      void persistPlaces({ items: state.items, lastPickup: item, lastDrop: state.lastDrop });
      return { lastPickup: item };
    });
    get().addRecentLocation({ ...place, kind: "pickup" });
  },

  setLastRideDrop: (place) => {
    set((state) => {
      const item = { ...place, kind: "drop" as const };
      void persistPlaces({ items: state.items, lastPickup: state.lastPickup, lastDrop: item });
      return { lastDrop: item };
    });
    get().addRecentLocation({ ...place, kind: "drop" });
  },

  rememberRideJourney: (pickup, drop) => {
    if (!isValidPlace(pickup) || !isValidPlace(drop)) return;
    set((state) => {
      const next = rememberInto(state.recentJourneys, pickup, drop, "ride");
      void persistList(JOURNEY_STORAGE_KEY, next);
      return { recentJourneys: next };
    });
    get().setLastRidePickup(pickup);
    get().setLastRideDrop(drop);
  },

  rememberParcelJourney: (pickup, drop) => {
    if (!isValidPlace(pickup) || !isValidPlace(drop)) return;
    set((state) => {
      const next = rememberInto(state.recentParcelJourneys, pickup, drop, "parcel");
      void persistList(PARCEL_JOURNEY_STORAGE_KEY, next);
      return { recentParcelJourneys: next };
    });
    get().addRecentLocation({ ...pickup, kind: "pickup" });
    get().addRecentLocation({ ...drop, kind: "drop" });
  },

  setLastCompletedRideJourney: (pickup, drop) => {
    if (!isValidPlace(pickup) || !isValidPlace(drop)) return;
    const last: RideJourney = { pickup, drop, savedAt: Date.now(), kind: "ride", fromCompletedRide: true };
    set({ lastCompletedRideJourney: last });
    void persistLast(LAST_RIDE_JOURNEY_KEY, last);
  },

  setLastCompletedParcelJourney: (pickup, drop) => {
    if (!isValidPlace(pickup) || !isValidPlace(drop)) return;
    const last: RideJourney = { pickup, drop, savedAt: Date.now(), kind: "parcel", fromCompletedRide: true };
    set({ lastCompletedParcelJourney: last });
    void persistLast(LAST_PARCEL_JOURNEY_KEY, last);
  },

  toggleFavoriteJourney: (journey) => {
    if (!isValidPlace(journey.pickup) || !isValidPlace(journey.drop)) return;
    const kind: JourneyKind = journey.kind === "parcel" ? "parcel" : "ride";
    set((state) => {
      if (kind === "parcel") {
        const next = toggleFavList(state.favoriteParcelJourneys, journey, "parcel");
        void persistList(FAV_PARCEL_JOURNEY_STORAGE_KEY, next);
        return { favoriteParcelJourneys: next };
      }
      const next = toggleFavList(state.favoriteJourneys, journey, "ride");
      void persistList(FAV_JOURNEY_STORAGE_KEY, next);
      return { favoriteJourneys: next };
    });
  },

  isFavoriteJourney: (pickup, drop, kind = "ride") => {
    const key = journeyKey(pickup, drop);
    const list = kind === "parcel" ? get().favoriteParcelJourneys : get().favoriteJourneys;
    return list.some((j) => journeyKey(j.pickup, j.drop) === key);
  },

  mergeFavoriteJourneysFromServer: (kind, journeys) => {
    const valid = journeys.filter((j) => isValidPlace(j.pickup) && isValidPlace(j.drop));
    if (valid.length === 0) return;
    set((state) => {
      const current = kind === "parcel" ? state.favoriteParcelJourneys : state.favoriteJourneys;
      const map = new Map<string, RideJourney>();
      for (const j of valid) map.set(journeyKey(j.pickup, j.drop), { ...j, kind });
      for (const j of current) {
        const key = journeyKey(j.pickup, j.drop);
        if (!map.has(key)) map.set(key, { ...j, kind });
      }
      const next = Array.from(map.values()).slice(0, MAX_JOURNEYS);
      void persistList(kind === "parcel" ? FAV_PARCEL_JOURNEY_STORAGE_KEY : FAV_JOURNEY_STORAGE_KEY, next);
      return kind === "parcel" ? { favoriteParcelJourneys: next } : { favoriteJourneys: next };
    });
  },

  clearRecentRideJourneys: () => {
    set({ recentJourneys: [] });
    void persistList(JOURNEY_STORAGE_KEY, []);
  },

  clearRecentParcelJourneys: () => {
    set({ recentParcelJourneys: [] });
    void persistList(PARCEL_JOURNEY_STORAGE_KEY, []);
  },

  pruneExpiredJourneys: () => {
    const now = Date.now();
    set((state) => {
      const ride = state.recentJourneys.filter((j) => isJourneyFresh(j, now));
      const parcel = state.recentParcelJourneys.filter((j) => isJourneyFresh(j, now));
      if (ride.length === state.recentJourneys.length && parcel.length === state.recentParcelJourneys.length) {
        return {};
      }
      if (ride.length !== state.recentJourneys.length) void persistList(JOURNEY_STORAGE_KEY, ride);
      if (parcel.length !== state.recentParcelJourneys.length) {
        void persistList(PARCEL_JOURNEY_STORAGE_KEY, parcel);
      }
      return { recentJourneys: ride, recentParcelJourneys: parcel };
    });
  },

  clearRecentLocations: () => {
    set({
      items: [],
      lastPickup: null,
      lastDrop: null,
      recentJourneys: [],
      favoriteJourneys: [],
      recentParcelJourneys: [],
      favoriteParcelJourneys: [],
      lastCompletedRideJourney: null,
      lastCompletedParcelJourney: null,
    });
    void AsyncStorage.multiRemove([
      STORAGE_KEY,
      JOURNEY_STORAGE_KEY,
      FAV_JOURNEY_STORAGE_KEY,
      PARCEL_JOURNEY_STORAGE_KEY,
      FAV_PARCEL_JOURNEY_STORAGE_KEY,
      LAST_RIDE_JOURNEY_KEY,
      LAST_PARCEL_JOURNEY_KEY,
    ]);
  },

  getRecentLocationKeys: () => {
    const { items } = get();
    return new Set(items.map((i) => locationKey(i.latitude, i.longitude, i.primary)));
  },

  hydrate: async () => {
    const { hydrated } = get();
    if (hydrated) return;
    try {
      const [
        placesRaw,
        journeysRaw,
        favRaw,
        parcelRaw,
        favParcelRaw,
        lastRideRaw,
        lastParcelRaw,
      ] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEY),
        AsyncStorage.getItem(JOURNEY_STORAGE_KEY),
        AsyncStorage.getItem(FAV_JOURNEY_STORAGE_KEY),
        AsyncStorage.getItem(PARCEL_JOURNEY_STORAGE_KEY),
        AsyncStorage.getItem(FAV_PARCEL_JOURNEY_STORAGE_KEY),
        AsyncStorage.getItem(LAST_RIDE_JOURNEY_KEY),
        AsyncStorage.getItem(LAST_PARCEL_JOURNEY_KEY),
      ]);
      let items: RecentLocationItem[] = [];
      let lastPickup: RecentLocationItem | null = null;
      let lastDrop: RecentLocationItem | null = null;
      if (placesRaw) {
        const parsed = JSON.parse(placesRaw) as {
          items?: RecentLocationItem[];
          lastPickup?: RecentLocationItem | null;
          lastDrop?: RecentLocationItem | null;
        };
        items = Array.isArray(parsed.items) ? parsed.items.slice(0, MAX_RECENT) : [];
        lastPickup = parsed.lastPickup ?? null;
        lastDrop = parsed.lastDrop ?? null;
      }
      const now = Date.now();
      const rideAll = parseJourneys(journeysRaw, "ride");
      const parcelAll = parseJourneys(parcelRaw, "parcel");
      const rideFresh = rideAll.filter((j) => isJourneyFresh(j, now));
      const parcelFresh = parcelAll.filter((j) => isJourneyFresh(j, now));
      if (rideFresh.length !== rideAll.length) void persistList(JOURNEY_STORAGE_KEY, rideFresh);
      if (parcelFresh.length !== parcelAll.length) {
        void persistList(PARCEL_JOURNEY_STORAGE_KEY, parcelFresh);
      }

      const lastRide =
        parseOneJourney(lastRideRaw, "ride") ??
        rideAll[0] ??
        (isValidPlace(lastPickup) && isValidPlace(lastDrop)
          ? { pickup: lastPickup, drop: lastDrop, savedAt: 0, kind: "ride" as const }
          : null);
      const lastParcel = parseOneJourney(lastParcelRaw, "parcel") ?? parcelAll[0] ?? null;
      if (!parseOneJourney(lastRideRaw, "ride") && lastRide) {
        void persistLast(LAST_RIDE_JOURNEY_KEY, lastRide);
      }
      if (!parseOneJourney(lastParcelRaw, "parcel") && lastParcel) {
        void persistLast(LAST_PARCEL_JOURNEY_KEY, lastParcel);
      }

      set({
        items,
        lastPickup,
        lastDrop,
        recentJourneys: rideFresh,
        favoriteJourneys: parseJourneys(favRaw, "ride"),
        recentParcelJourneys: parcelFresh,
        favoriteParcelJourneys: parseJourneys(favParcelRaw, "parcel"),
        lastCompletedRideJourney: lastRide,
        lastCompletedParcelJourney: lastParcel,
        hydrated: true,
      });
      return;
    } catch {
      /* fall through */
    }
    set({ hydrated: true });
  },
}));

export { locationKey as recentLocationKey };
