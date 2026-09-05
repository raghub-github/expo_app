import { type QueryClient, useQuery } from "@tanstack/react-query";
import { offersService } from "@/services/offers.service";
import {
  normalizeOfferLocationParams,
  type OfferLocationParams,
} from "@/lib/featuredOfferGeo";

export type FeaturedOffersHomeParams = OfferLocationParams;

export function featuredOffersHomeQueryKey(params: FeaturedOffersHomeParams) {
  const p = normalizeOfferLocationParams(params);
  return ["featured-offers-home", p.lat, p.lng, p.pincode, p.state, p.city] as const;
}

export function featuredOffersHomeQueryOptions(params: FeaturedOffersHomeParams) {
  const p = normalizeOfferLocationParams(params);
  return {
    queryKey: featuredOffersHomeQueryKey(p),
    queryFn: () =>
      offersService.getFeaturedOffers({
        pincode: p.pincode,
        state: p.state,
        city: p.city,
        lat: p.lat,
        lng: p.lng,
        serviceType: "FOOD" as const,
        limit: 6,
      }),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
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
