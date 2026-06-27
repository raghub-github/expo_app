import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { prefetchFoodHomeLayout } from "@/lib/foodHomeLayoutCache";
import { useLocationStore } from "@/store/locationStore";

/** Warm food-home layout as soon as location is known — avoids classic → grid_first flash. */
export function FoodHomeLayoutPrefetch() {
  const queryClient = useQueryClient();
  const locationHydrated = useLocationStore((s) => s.locationHydrated);
  const coords = useLocationStore((s) => s.coords);
  const address = useLocationStore((s) => s.address);

  useEffect(() => {
    if (!locationHydrated) return;
    void prefetchFoodHomeLayout(queryClient, address, coords);
  }, [
    locationHydrated,
    coords?.latitude,
    coords?.longitude,
    address?.pincode,
    address?.state,
    queryClient,
  ]);

  return null;
}
