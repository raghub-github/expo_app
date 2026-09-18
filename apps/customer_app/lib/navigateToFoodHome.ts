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
import { navigatePrimaryTab } from "@/lib/navigatePrimaryTab";

/** True while a Food listing instance (tab or /home) is mounted. */
let foodHomeRouteMounted = false;

export function markFoodHomeRouteMounted(mounted: boolean): void {
  foodHomeRouteMounted = mounted;
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

/**
 * Open Food listing via the Food TAB (same path as Orders/Profile).
 * Never awaits APIs — navigate first, warm cache after interactions.
 * Uses primary-tab epoch guard (no timed navigate lock).
 *
 * Merchant /home stack sits above tabs. If Food is already the active tab,
 * `navigatePrimaryTab("food")` is a same-tab no-op — so we must dismiss the
 * overlay stack first or HOME edge / Food taps appear broken.
 */
export function navigateToFoodHome(router: Router): void {
  resetFoodHomeListScrollGuard();

  try {
    const dismissAll = (router as { dismissAll?: () => void }).dismissAll;
    if (typeof dismissAll === "function") {
      dismissAll.call(router);
    } else {
      const canDismiss = (router as { canDismiss?: () => boolean }).canDismiss;
      const dismiss = (router as { dismiss?: () => void }).dismiss;
      if (typeof canDismiss === "function" && typeof dismiss === "function") {
        let guard = 0;
        while (canDismiss.call(router) && guard++ < 12) {
          dismiss.call(router);
        }
      } else if (typeof router.canGoBack === "function" && router.canGoBack()) {
        router.back();
      }
    }
  } catch {
    /* ignore — still jump to Food tab below */
  }

  navigatePrimaryTab("food", "navigateToFoodHome", router);

  InteractionManager.runAfterInteractions(() => {
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
