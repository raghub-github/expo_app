import type { Router } from "expo-router";
import { ROUTES } from "@/constants/paths";
import { prioritizeVisibleMerchantBanners } from "@/lib/prefetchMerchantBanners";
import { resetFoodHomeListScrollGuard } from "@/lib/foodHomeScrollGuard";
import { useLocationStore } from "@/store/locationStore";
import { useDietaryPreferenceStore } from "@/store/dietaryPreferenceStore";
import { seedMerchantsListQueryIfCached } from "@/lib/merchantsListCache";
import { queryClient } from "@/lib/queryClient";

/** Block stacked /home pushes from pressIn+press or slow taps. */
let navigateLockUntil = 0;
/** True while a Food Home (/home index) instance is mounted. */
let foodHomeRouteMounted = false;

export function markFoodHomeRouteMounted(mounted: boolean): void {
  foodHomeRouteMounted = mounted;
  if (!mounted) {
    // Allow a fresh open shortly after leaving (don't wait full lock).
    navigateLockUntil = Math.min(navigateLockUntil, Date.now() + 280);
  }
}

function seedNearbyMerchantsForFoodEntry(): void {
  const { coords } = useLocationStore.getState();
  if (coords?.latitude == null || coords?.longitude == null) return;
  const lat = coords.latitude;
  const lng = coords.longitude;
  const vegOnly = useDietaryPreferenceStore.getState().vegOnly;
  seedMerchantsListQueryIfCached(queryClient, lat, lng, vegOnly, "FOOD");
  seedMerchantsListQueryIfCached(queryClient, lat, lng, false, "FOOD");
  seedMerchantsListQueryIfCached(queryClient, lat, lng, true, "FOOD");
  prioritizeVisibleMerchantBanners(12);
}

/**
 * Open food listing once per gesture / mount.
 * Do not call from both onPressIn and onPress — prefer onPressIn only.
 */
export function navigateToFoodHome(router: Router): void {
  const now = Date.now();
  if (now < navigateLockUntil) return;
  // Already on Food Inner — never stack a second /home (causes double-back + list flash).
  if (foodHomeRouteMounted) return;

  navigateLockUntil = now + 1_500;
  foodHomeRouteMounted = true;

  resetFoodHomeListScrollGuard();
  seedNearbyMerchantsForFoodEntry();
  router.push(ROUTES.HOME_FOOD as never);
}

/**
 * Warm the food-home JS bundle + imagery while the user is still on main Home,
 * so the first Food tap does not wait on Metro/route load.
 */
export function warmFoodHomeEntry(): void {
  seedNearbyMerchantsForFoodEntry();
  void import("@/app/home/index").catch(() => {
    /* route may already be in the graph; ignore */
  });
}
