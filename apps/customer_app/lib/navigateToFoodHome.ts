import type { Router } from "expo-router";
import { InteractionManager } from "react-native";
import { resetFoodHomeListScrollGuard } from "@/lib/foodHomeScrollGuard";
import { useLocationStore } from "@/store/locationStore";
import { useDietaryPreferenceStore } from "@/store/dietaryPreferenceStore";
import {
  readSyncMerchantsList,
  seedMerchantsListQueryIfCached,
} from "@/lib/merchantsListCache";
import { queryClient } from "@/lib/queryClient";
import { seedFeaturedOffersHomeQueryIfCached } from "@/lib/featuredOffersHomeCache";
import { normalizeOfferLocationParams } from "@/lib/featuredOfferGeo";
import {
  getSyncFoodHomeLayoutFromQueryClient,
  readSyncFoodHomeLayout,
  buildFoodHomeLayoutQueryKey,
} from "@/lib/foodHomeLayoutCache";
import { extractCustomerGeoHints } from "@/lib/customer-geo-hints";
import { prefetchGridFirstHeroMedia } from "@/lib/prefetchGridFirstHeroMedia";
import { prefetchMealsUnder250HeroMedia } from "@/lib/prefetchMealsUnder250HeroMedia";
import { prioritizeVisibleMerchantBanners, prefetchMerchantBanners } from "@/lib/prefetchMerchantBanners";
import { prefetchMerchantCardImages } from "@/lib/imageEngine";

/** Block double pressIn+press from stacking navigations. */
let navigateLockUntil = 0;
/** True while a Food listing instance (tab or /home) is mounted. */
let foodHomeRouteMounted = false;

const FOOD_TAB_HREF = "/(tabs)/food" as const;

export function markFoodHomeRouteMounted(mounted: boolean): void {
  foodHomeRouteMounted = mounted;
  if (!mounted) {
    navigateLockUntil = Math.min(navigateLockUntil, Date.now() + 280);
  }
}

export function isFoodHomeRouteMounted(): boolean {
  return foodHomeRouteMounted;
}

/** Cheap MMKV → React Query only (no imagery). Safe after navigation is scheduled. */
function seedNearbyMerchantsListOnly(): void {
  const { coords, address } = useLocationStore.getState();
  if (coords?.latitude == null || coords?.longitude == null) return;
  const lat = coords.latitude;
  const lng = coords.longitude;
  const vegOnly = useDietaryPreferenceStore.getState().vegOnly;
  seedMerchantsListQueryIfCached(queryClient, lat, lng, vegOnly, "FOOD");
  seedMerchantsListQueryIfCached(queryClient, lat, lng, false, "FOOD");
  seedMerchantsListQueryIfCached(queryClient, lat, lng, true, "FOOD");

  const hints = extractCustomerGeoHints(address, coords);
  const layout =
    getSyncFoodHomeLayoutFromQueryClient(queryClient, hints) ?? readSyncFoodHomeLayout(hints);
  if (layout?.layoutKey) {
    queryClient.setQueryData(buildFoodHomeLayoutQueryKey(hints), (prev) => prev ?? layout);
  }
  seedFeaturedOffersHomeQueryIfCached(
    queryClient,
    normalizeOfferLocationParams({
      lat,
      lng,
      pincode: address?.pincode?.trim() || undefined,
      state: address?.state?.trim() || undefined,
      city: address?.city?.trim() || undefined,
    }),
  );
}

function warmNearbyMerchantImagery(): void {
  const { coords, address } = useLocationStore.getState();
  if (coords?.latitude == null || coords?.longitude == null) return;
  const lat = coords.latitude;
  const lng = coords.longitude;
  const vegOnly = useDietaryPreferenceStore.getState().vegOnly;

  const list = readSyncMerchantsList(lat, lng, vegOnly) ?? readSyncMerchantsList(lat, lng, false);
  if (list?.length) {
    prefetchMerchantCardImages(list);
    prefetchMerchantBanners(list);
  }
  prioritizeVisibleMerchantBanners(12);

  const hints = extractCustomerGeoHints(address, coords);
  const layout =
    getSyncFoodHomeLayoutFromQueryClient(queryClient, hints) ?? readSyncFoodHomeLayout(hints);
  if (layout?.layoutKey) {
    prefetchGridFirstHeroMedia(layout.gridFirstHeroMedia);
    prefetchMealsUnder250HeroMedia(layout);
  }
}

function logFoodNav(phase: string, t0?: number): void {
  if (!__DEV__) return;
  const ms = t0 != null ? ` +${Date.now() - t0}ms` : "";
  // eslint-disable-next-line no-console
  console.log(`[FOOD_NAV] ${phase}${ms}`);
}

/**
 * Open Food listing via the Food TAB (same path as Orders/Profile).
 * Never awaits APIs — navigate first, warm cache after interactions.
 */
export function navigateToFoodHome(router: Router): void {
  const t0 = Date.now();
  logFoodNav("press", t0);

  const now = Date.now();
  if (now < navigateLockUntil) {
    logFoodNav("deduped", t0);
    return;
  }
  // Long enough that pressIn + late onPress cannot stack a second Home→Food trip.
  navigateLockUntil = now + 1200;

  resetFoodHomeListScrollGuard();
  logFoodNav("navigation-start", t0);
  // Tab navigate reuses a mounted Food screen when freezeOnBlur keeps it alive.
  router.navigate(FOOD_TAB_HREF as never);

  InteractionManager.runAfterInteractions(() => {
    logFoodNav("after-interactions-warm", t0);
    try {
      seedNearbyMerchantsListOnly();
      warmNearbyMerchantImagery();
    } catch {
      /* ignore */
    }
  });
}

/**
 * Warm the food-home JS bundle + cache while the user is still on main Home,
 * so the first Food tap only has to switch tabs.
 */
export function warmFoodHomeEntry(): void {
  // Light sync seed only — defer imagery so Home scroll stays smooth.
  seedNearbyMerchantsListOnly();
  void import("@/app/home/index")
    .then(() => {
      InteractionManager.runAfterInteractions(() => {
        try {
          warmNearbyMerchantImagery();
        } catch {
          /* ignore */
        }
      });
    })
    .catch(() => {
      /* route may already be in the graph; ignore */
    });
}
