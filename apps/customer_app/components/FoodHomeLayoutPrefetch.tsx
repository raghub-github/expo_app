import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { prefetchFoodHomeLayout } from "@/lib/foodHomeLayoutCache";
import { prefetchUserAppCategories } from "@/lib/userAppCategoryCache";
import { useLocationStore } from "@/store/locationStore";
import { merchantService } from "@/services/merchant.service";
import { useDietaryPreferenceStore } from "@/store/dietaryPreferenceStore";

/** Warm food-home layout + nearby merchants as soon as location is known. */
export function FoodHomeLayoutPrefetch() {
  const queryClient = useQueryClient();
  const locationHydrated = useLocationStore((s) => s.locationHydrated);
  const coords = useLocationStore((s) => s.coords);
  const address = useLocationStore((s) => s.address);
  const vegOnly = useDietaryPreferenceStore((s) => s.vegOnly);

  useEffect(() => {
    if (!locationHydrated) return;
    void prefetchFoodHomeLayout(queryClient, address, coords);
    void prefetchUserAppCategories(queryClient, "FOOD");
  }, [
    locationHydrated,
    coords?.latitude,
    coords?.longitude,
    address?.pincode,
    address?.state,
    queryClient,
  ]);

  useEffect(() => {
    if (!locationHydrated || coords?.latitude == null || coords?.longitude == null) return;
    void queryClient.prefetchQuery({
      queryKey: ["merchants", coords.latitude, coords.longitude, vegOnly],
      queryFn: () =>
        merchantService.getMerchants({
          limit: 20,
          lat: coords.latitude,
          lng: coords.longitude,
          vegOnly,
          distanceMode: "road",
        }),
      staleTime: 60_000,
    });
  }, [locationHydrated, coords?.latitude, coords?.longitude, vegOnly, queryClient]);

  return null;
}
