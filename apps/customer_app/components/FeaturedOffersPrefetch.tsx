import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocationStore } from "@/store/locationStore";
import { prefetchFeaturedOffersHome } from "@/hooks/useFeaturedOffersHome";
import { prefetchFeaturedOffersRide } from "@/hooks/useFeaturedOffersRide";

/** Warm home + ride promo offers as soon as location is hydrated — avoids banner/sheet loading flash. */
export function FeaturedOffersPrefetch() {
  const queryClient = useQueryClient();
  const locationHydrated = useLocationStore((s) => s.locationHydrated);
  const coords = useLocationStore((s) => s.coords);
  const address = useLocationStore((s) => s.address);

  useEffect(() => {
    if (!locationHydrated) return;
    const params = {
      lat: coords?.latitude,
      lng: coords?.longitude,
      pincode: address?.pincode?.trim() || undefined,
      state: address?.state?.trim() || undefined,
      city: address?.city?.trim() || undefined,
    };
    void prefetchFeaturedOffersHome(queryClient, params);
    void prefetchFeaturedOffersRide(queryClient, params);
  }, [
    locationHydrated,
    coords?.latitude,
    coords?.longitude,
    address?.pincode,
    address?.state,
    address?.city,
    queryClient,
  ]);

  return null;
}
