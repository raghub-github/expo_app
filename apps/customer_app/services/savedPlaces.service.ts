/**
 * Customer favorite pins + favorite journeys.
 * Heart toggles only — recents stay on-device.
 */

import { api } from "./api";

export type SavedPlaceKind = "ride" | "parcel";

export type SavedPlacePoint = {
  latitude: number;
  longitude: number;
  primary: string;
  fullAddress?: string;
  savedAt?: number;
};

export type SavedJourneyPayload = {
  serviceKind: SavedPlaceKind;
  pickup: SavedPlacePoint;
  drop: SavedPlacePoint;
  savedAt?: number;
};

export type SavedPlacesSnapshot = {
  locations: SavedPlacePoint[];
  journeys: SavedJourneyPayload[];
};

function silent<T>(fn: () => Promise<T>): void {
  void fn().catch(() => undefined);
}

export const savedPlacesService = {
  async list(): Promise<SavedPlacesSnapshot> {
    const { data } = await api.get<{ ok: boolean } & SavedPlacesSnapshot>("/v1/me/saved-places");
    return {
      locations: Array.isArray(data?.locations) ? data.locations : [],
      journeys: Array.isArray(data?.journeys) ? data.journeys : [],
    };
  },

  upsertLocation(place: SavedPlacePoint): void {
    silent(() =>
      api.put("/v1/me/saved-places/locations", {
        latitude: place.latitude,
        longitude: place.longitude,
        primary: place.primary,
        fullAddress: place.fullAddress,
      })
    );
  },

  deleteLocation(latitude: number, longitude: number): void {
    silent(() =>
      api.delete("/v1/me/saved-places/locations", {
        params: { latitude, longitude },
      })
    );
  },

  upsertJourney(journey: SavedJourneyPayload): void {
    silent(() =>
      api.put("/v1/me/saved-places/journeys", {
        serviceKind: journey.serviceKind,
        pickup: {
          latitude: journey.pickup.latitude,
          longitude: journey.pickup.longitude,
          primary: journey.pickup.primary,
          fullAddress: journey.pickup.fullAddress,
        },
        drop: {
          latitude: journey.drop.latitude,
          longitude: journey.drop.longitude,
          primary: journey.drop.primary,
          fullAddress: journey.drop.fullAddress,
        },
      })
    );
  },

  deleteJourney(journey: SavedJourneyPayload): void {
    silent(() =>
      api.delete("/v1/me/saved-places/journeys", {
        params: {
          serviceKind: journey.serviceKind,
          pickupLat: journey.pickup.latitude,
          pickupLng: journey.pickup.longitude,
          dropLat: journey.drop.latitude,
          dropLng: journey.drop.longitude,
        },
      })
    );
  },

  syncOnce(snapshot: {
    locations?: SavedPlacePoint[];
    journeys?: SavedJourneyPayload[];
  }): void {
    const locations = snapshot.locations?.slice(0, 40) ?? [];
    const journeys = snapshot.journeys?.slice(0, 24) ?? [];
    if (locations.length === 0 && journeys.length === 0) return;
    silent(() => api.put("/v1/me/saved-places/sync", { locations, journeys }));
  },
};
