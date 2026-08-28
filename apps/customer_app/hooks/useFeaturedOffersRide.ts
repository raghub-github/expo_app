import { type QueryClient, useQuery } from "@tanstack/react-query";
import { offersService } from "@/services/offers.service";

export type FeaturedOffersRideParams = {
  lat?: number;
  lng?: number;
  pincode?: string;
  state?: string;
  city?: string;
};

export function featuredOffersRideQueryKey(params: FeaturedOffersRideParams) {
  return [
    "featured-offers-ride",
    params.lat,
    params.lng,
    params.pincode,
    params.state,
    params.city,
  ] as const;
}

export function featuredOffersRideQueryOptions(params: FeaturedOffersRideParams) {
  return {
    queryKey: featuredOffersRideQueryKey(params),
    queryFn: () =>
      offersService.getFeaturedOffers({
        pincode: params.pincode,
        state: params.state,
        city: params.city,
        lat: params.lat,
        lng: params.lng,
        serviceType: "RIDE",
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
