import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocationStore } from "@/store/locationStore";
import { prefetchFeaturedOffersHome } from "@/hooks/useFeaturedOffersHome";
import { prefetchFeaturedOffersRide } from "@/hooks/useFeaturedOffersRide";
import { prefetchServiceCardOfferPills } from "@/hooks/useServiceCardOfferPills";
import { normalizeOfferLocationParams } from "@/lib/featuredOfferGeo";

/** Warm home + ride promo offers + grocery/parcel pills as soon as location is ready. */
export function FeaturedOffersPrefetch() {
  const queryClient = useQueryClient();
  const locationHydrated = useLocationStore((s) => s.locationHydrated);
  const coords = useLocationStore((s) => s.coords);
  const address = useLocationStore((s) => s.address);
  const params = normalizeOfferLocationParams({
    lat: coords?.latitude,
    lng: coords?.longitude,
    pincode: address?.pincode?.trim() || undefined,
    state: address?.state?.trim() || undefined,
    city: address?.city?.trim() || undefined,
  });

  useEffect(() => {
    if (!locationHydrated) return;
    void prefetchFeaturedOffersHome(queryClient, params);
    void prefetchFeaturedOffersRide(queryClient, params);
    void prefetchServiceCardOfferPills(queryClient, params);
  }, [
    locationHydrated,
    params.lat,
    params.lng,
    params.pincode,
    params.state,
    params.city,
    queryClient,
  ]);

  return null;
}
