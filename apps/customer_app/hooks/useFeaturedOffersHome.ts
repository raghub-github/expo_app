import { type QueryClient, useQuery } from "@tanstack/react-query";
import { offersService } from "@/services/offers.service";

export type FeaturedOffersHomeParams = {
  lat?: number;
  lng?: number;
  pincode?: string;
  state?: string;
  city?: string;
};

export function featuredOffersHomeQueryKey(params: FeaturedOffersHomeParams) {
  return [
    "featured-offers-home",
    params.lat,
    params.lng,
    params.pincode,
    params.state,
    params.city,
  ] as const;
}

export function featuredOffersHomeQueryOptions(params: FeaturedOffersHomeParams) {
  return {
    queryKey: featuredOffersHomeQueryKey(params),
    queryFn: () =>
      offersService.getFeaturedOffers({
        pincode: params.pincode,
        state: params.state,
        city: params.city,
        lat: params.lat,
        lng: params.lng,
        serviceType: "FOOD",
        limit: 6,
      }),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  } as const;
}

export function prefetchFeaturedOffersHome(
  queryClient: QueryClient,
  params: FeaturedOffersHomeParams
) {
  return queryClient.prefetchQuery(featuredOffersHomeQueryOptions(params));
}

export function useFeaturedOffersHome(
  params: FeaturedOffersHomeParams,
  enabled: boolean
) {
  return useQuery({
    ...featuredOffersHomeQueryOptions(params),
    enabled,
    placeholderData: (prev) => prev,
  });
}
