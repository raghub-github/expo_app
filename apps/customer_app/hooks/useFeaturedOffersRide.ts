import { type QueryClient, useQuery } from "@tanstack/react-query";
import { offersService } from "@/services/offers.service";
import {
  normalizeOfferLocationParams,
  type OfferLocationParams,
} from "@/lib/featuredOfferGeo";

export type FeaturedOffersRideParams = OfferLocationParams;

export function featuredOffersRideQueryKey(params: FeaturedOffersRideParams) {
  const p = normalizeOfferLocationParams(params);
  return ["featured-offers-ride", p.lat, p.lng, p.pincode, p.state, p.city] as const;
}

export function featuredOffersRideQueryOptions(params: FeaturedOffersRideParams) {
  const p = normalizeOfferLocationParams(params);
  return {
    queryKey: featuredOffersRideQueryKey(p),
    queryFn: () =>
      offersService.getFeaturedOffers({
        pincode: p.pincode,
        state: p.state,
        city: p.city,
        lat: p.lat,
        lng: p.lng,
        serviceType: "RIDE" as const,
        limit: 10,
      }),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  } as const;
}

export function prefetchFeaturedOffersRide(
  queryClient: QueryClient,
  params: FeaturedOffersRideParams
) {
  return queryClient.prefetchQuery(featuredOffersRideQueryOptions(params));
}

export function useFeaturedOffersRide(
  params: FeaturedOffersRideParams,
  enabled = true
) {
  return useQuery({
    ...featuredOffersRideQueryOptions(params),
    enabled,
  });
}
