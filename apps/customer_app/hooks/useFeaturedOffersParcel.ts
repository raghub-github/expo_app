import { useQuery } from "@tanstack/react-query";
import { offersService } from "@/services/offers.service";

export type FeaturedOffersParcelParams = {
  lat?: number;
  lng?: number;
  pincode?: string;
  state?: string;
  city?: string;
};

export function useFeaturedOffersParcel(
  params: FeaturedOffersParcelParams,
  enabled = true
) {
  return useQuery({
    queryKey: [
      "featured-offers-parcel",
      params.lat,
      params.lng,
      params.pincode,
      params.state,
      params.city,
    ],
    queryFn: () =>
      offersService.getFeaturedOffers({
        pincode: params.pincode,
        state: params.state,
        city: params.city,
        lat: params.lat,
        lng: params.lng,
        serviceType: "PARCEL",
        limit: 10,
      }),
    enabled,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 1,
    refetchOnMount: true,
  });
}
