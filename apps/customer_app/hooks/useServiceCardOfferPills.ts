/**
 * Geo-bound featured offers for home service-card corner pills.
 * Prefetch + shared query keys so pills paint from cache on first home frame.
 */

import { useMemo } from "react";
import { type QueryClient, useQueries } from "@tanstack/react-query";
import { useLocationStore } from "@/store/locationStore";
import { offersService } from "@/services/offers.service";
import type { CustomerHomeServiceId } from "@/lib/customerHomeServiceMeta";
import {
  pickBestFeaturedOffer,
  resolveServiceOfferPillText,
} from "@/lib/serviceOfferPill";

type OfferServiceType = "FOOD" | "GROCERY" | "PARCEL" | "RIDE";

const SERVICE_TYPES: OfferServiceType[] = ["FOOD", "GROCERY", "RIDE", "PARCEL"];

export type ServiceOfferPillMap = Partial<Record<CustomerHomeServiceId, string>>;

export type ServiceOfferPillParams = {
  lat?: number;
  lng?: number;
  pincode?: string;
  state?: string;
  city?: string;
};

export function serviceOfferPillQueryKey(
  serviceType: OfferServiceType,
  params: ServiceOfferPillParams
) {
  return [
    "featured-offers-service-pill",
    serviceType,
    params.lat,
    params.lng,
    params.pincode,
    params.state,
    params.city,
  ] as const;
}

export function prefetchServiceCardOfferPills(
  queryClient: QueryClient,
  params: ServiceOfferPillParams
) {
  return Promise.all(
    SERVICE_TYPES.map((serviceType) =>
      queryClient.prefetchQuery({
        queryKey: serviceOfferPillQueryKey(serviceType, params),
        queryFn: () =>
          offersService.getFeaturedOffers({
            ...params,
            serviceType,
            limit: 3,
          }),
        staleTime: 5 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
      })
    )
  );
}

export function useServiceCardOfferPills(enabled = true): ServiceOfferPillMap {
  const pincode = useLocationStore((s) => s.address?.pincode?.trim() || undefined);
  const state = useLocationStore((s) => s.address?.state?.trim() || undefined);
  const city = useLocationStore((s) => s.address?.city?.trim() || undefined);
  const lat = useLocationStore((s) => s.coords?.latitude);
  const lng = useLocationStore((s) => s.coords?.longitude);
  const locationHydrated = useLocationStore((s) => s.locationHydrated);

  const params: ServiceOfferPillParams = { pincode, state, city, lat, lng };

  const queries = useQueries({
    queries: SERVICE_TYPES.map((serviceType) => ({
      queryKey: serviceOfferPillQueryKey(serviceType, params),
      queryFn: () =>
        offersService.getFeaturedOffers({
          ...params,
          serviceType,
          limit: 3,
        }),
      enabled: enabled && locationHydrated,
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
      // Keep last location's pills while coords settle — avoids empty→label flash.
      placeholderData: (prev: { offers?: unknown } | undefined) => prev,
    })),
  });

  const foodOffers = queries[0]?.data?.offers;
  const groceryOffers = queries[1]?.data?.offers;
  const rideOffers = queries[2]?.data?.offers;
  const parcelOffers = queries[3]?.data?.offers;

  return useMemo(() => {
    const food = pickBestFeaturedOffer(foodOffers);
    const grocery = pickBestFeaturedOffer(groceryOffers);
    const ride = pickBestFeaturedOffer(rideOffers);
    const parcel = pickBestFeaturedOffer(parcelOffers);
    const nearMeOffer = food ?? grocery ?? null;

    return {
      food: resolveServiceOfferPillText(food) ?? undefined,
      grocery: resolveServiceOfferPillText(grocery) ?? undefined,
      ride: resolveServiceOfferPillText(ride) ?? undefined,
      parcels: resolveServiceOfferPillText(parcel) ?? undefined,
      "near-me": resolveServiceOfferPillText(nearMeOffer) ?? undefined,
    } satisfies ServiceOfferPillMap;
  }, [foodOffers, groceryOffers, rideOffers, parcelOffers]);
}
