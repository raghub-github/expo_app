/**
 * Pull server favorites into local stores (once per session).
 * Local-first: GET merges in; unsynced local hearts are uploaded in one batch.
 */

import { savedPlacesService, type SavedJourneyPayload } from "@/services/savedPlaces.service";
import { useFavoriteLocationsStore } from "@/store/favoriteLocationsStore";
import {
  journeyKey,
  useRecentLocationStore,
  type JourneyKind,
  type RideJourney,
} from "@/store/recentLocationStore";

let pullInFlight: Promise<void> | null = null;
let lastPulledCustomerId: string | null = null;

function toJourney(item: SavedJourneyPayload, kind: JourneyKind): RideJourney | null {
  const pickup = item?.pickup;
  const drop = item?.drop;
  const pLat = Number(pickup?.latitude);
  const pLng = Number(pickup?.longitude);
  const dLat = Number(drop?.latitude);
  const dLng = Number(drop?.longitude);
  if (!Number.isFinite(pLat) || !Number.isFinite(pLng) || !Number.isFinite(dLat) || !Number.isFinite(dLng)) {
    return null;
  }
  return {
    kind,
    savedAt: item.savedAt ?? Date.now(),
    pickup: {
      latitude: pLat,
      longitude: pLng,
      primary: String(pickup?.primary ?? "").trim() || "Pickup",
      fullAddress: pickup?.fullAddress,
      kind: "pickup",
    },
    drop: {
      latitude: dLat,
      longitude: dLng,
      primary: String(drop?.primary ?? "").trim() || "Drop",
      fullAddress: drop?.fullAddress,
      kind: "drop",
    },
  };
}

export async function pullSavedPlacesFromServer(customerId: string | null | undefined): Promise<void> {
  if (!customerId) return;
  if (lastPulledCustomerId === customerId && pullInFlight == null) return;
  if (pullInFlight) return pullInFlight;

  pullInFlight = (async () => {
    try {
      const snapshot = await savedPlacesService.list();
      useFavoriteLocationsStore.getState().mergeFromServer(
        snapshot.locations.map((loc) => ({
          latitude: loc.latitude,
          longitude: loc.longitude,
          primary: loc.primary,
          fullAddress: loc.fullAddress,
          savedAt: loc.savedAt ?? Date.now(),
        }))
      );

      const ride = snapshot.journeys.filter((j) => j.serviceKind === "ride");
      const parcel = snapshot.journeys.filter((j) => j.serviceKind === "parcel");
      const store = useRecentLocationStore.getState();
      store.mergeFavoriteJourneysFromServer(
        "ride",
        ride.map((j) => toJourney(j, "ride")).filter((j): j is NonNullable<typeof j> => j != null)
      );
      store.mergeFavoriteJourneysFromServer(
        "parcel",
        parcel.map((j) => toJourney(j, "parcel")).filter((j): j is NonNullable<typeof j> => j != null)
      );

      const localLocations = useFavoriteLocationsStore.getState().items;
      const serverLocKeys = new Set(
        snapshot.locations.map((l) => `${Math.round(l.latitude * 10000) / 10000},${Math.round(l.longitude * 10000) / 10000}`)
      );
      const unsyncedLocations = localLocations.filter((item) => {
        const key = `${Math.round(item.latitude * 10000) / 10000},${Math.round(item.longitude * 10000) / 10000}`;
        return !serverLocKeys.has(key);
      });

      const nextStore = useRecentLocationStore.getState();
      const unsyncedJourneys: SavedJourneyPayload[] = [];
      const pushUnsynced = (kind: JourneyKind, local: RideJourney[], server: RideJourney[]) => {
        const serverKeys = new Set(server.map((j) => journeyKey(j.pickup, j.drop)));
        for (const j of local) {
          if (!serverKeys.has(journeyKey(j.pickup, j.drop))) {
            unsyncedJourneys.push({
              serviceKind: kind,
              pickup: j.pickup,
              drop: j.drop,
            });
          }
        }
      };
      pushUnsynced(
        "ride",
        nextStore.favoriteJourneys,
        ride.map((j) => toJourney(j, "ride")).filter((j): j is NonNullable<typeof j> => j != null)
      );
      pushUnsynced(
        "parcel",
        nextStore.favoriteParcelJourneys,
        parcel.map((j) => toJourney(j, "parcel")).filter((j): j is NonNullable<typeof j> => j != null)
      );

      if (unsyncedLocations.length > 0 || unsyncedJourneys.length > 0) {
        savedPlacesService.syncOnce({
          locations: unsyncedLocations,
          journeys: unsyncedJourneys,
        });
      }
      lastPulledCustomerId = customerId;
    } catch {
      /* keep local cache */
    } finally {
      pullInFlight = null;
    }
  })();

  return pullInFlight;
}

export function resetSavedPlacesPull(): void {
  lastPulledCustomerId = null;
  pullInFlight = null;
}
