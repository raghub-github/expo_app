/**
 * Geo-bound featured offers for home service-card corner pills.
 * FOOD/RIDE reuse the home/ride featured queries so we do not duplicate those APIs.
 */

import { useMemo } from "react";
import { type QueryClient, useQueries, keepPreviousData } from "@tanstack/react-query";
import { useLocationStore } from "@/store/locationStore";
import { offersService } from "@/services/offers.service";
import type { CustomerHomeServiceId } from "@/lib/customerHomeServiceMeta";
import {
  pickBestFeaturedOffer,
  resolveServiceOfferPillText,
} from "@/lib/serviceOfferPill";
import {
  normalizeOfferLocationParams,
  type OfferLocationParams,
} from "@/lib/featuredOfferGeo";
import { featuredOffersHomeQueryOptions } from "@/hooks/useFeaturedOffersHome";
import { featuredOffersRideQueryOptions } from "@/hooks/useFeaturedOffersRide";

type PillOnlyServiceType = "GROCERY" | "PARCEL";

const PILL_ONLY_TYPES: PillOnlyServiceType[] = ["GROCERY", "PARCEL"];

export type ServiceOfferPillMap = Partial<Record<CustomerHomeServiceId, string>>;

export type ServiceOfferPillParams = OfferLocationParams;

export function serviceOfferPillQueryKey(
  serviceType: PillOnlyServiceType,
  params: ServiceOfferPillParams
) {
  const p = normalizeOfferLocationParams(params);
  return [
    "featured-offers-service-pill",
    serviceType,
    p.lat,
    p.lng,
    p.pincode,
    p.state,
    p.city,
  ] as const;
}

export function prefetchServiceCardOfferPills(
  queryClient: QueryClient,
  params: ServiceOfferPillParams
) {
  const p = normalizeOfferLocationParams(params);
  return Promise.all(
    PILL_ONLY_TYPES.map((serviceType) =>
      queryClient.prefetchQuery({
        queryKey: serviceOfferPillQueryKey(serviceType, p),
        queryFn: () =>
          offersService.getFeaturedOffers({
            ...p,
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

  const params = normalizeOfferLocationParams({ pincode, state, city, lat, lng });
  const ready = enabled && locationHydrated;

  const queries = useQueries({
    queries: [
      {
        ...featuredOffersHomeQueryOptions(params),
        enabled: ready,
        placeholderData: keepPreviousData,
      },
      {
        ...featuredOffersRideQueryOptions(params),
        enabled: ready,
        placeholderData: keepPreviousData,
      },
      ...PILL_ONLY_TYPES.map((serviceType) => ({
        queryKey: serviceOfferPillQueryKey(serviceType, params),
        queryFn: () =>
          offersService.getFeaturedOffers({
            ...params,
            serviceType,
            limit: 3,
          }),
        enabled: ready,
        staleTime: 5 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        retry: 1,
        refetchOnWindowFocus: false,
        placeholderData: keepPreviousData,
      })),
    ],
  });

  const foodOffers = queries[0]?.data?.offers;
  const rideOffers = queries[1]?.data?.offers;
  const groceryOffers = queries[2]?.data?.offers;
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
