import type { Router } from "expo-router";
import type { QueryClient } from "@tanstack/react-query";
import type { MerchantSummary } from "@/services/merchant.service";
import { buildMerchantDetailParams } from "@/lib/merchantHeroWarmCache";
import {
  prefetchMerchantDetail,
} from "@/lib/prefetchMerchantDetail";
import { seedMerchantMenuQueryIfCached } from "@/lib/merchantMenuCache";
import { useScreenChromeStore } from "@/store/screenChromeStore";
import { useMerchantNavTransitionStore } from "@/store/merchantNavTransitionStore";
import { peekCachedFoodHomeLayoutKey } from "@/lib/foodHomeLayoutCache";

let navigateLockUntil = 0;

export type NavigateToMerchantOptions = {
  /**
   * Replace the current merchant screen instead of stacking another.
   * Use for "similar restaurants" so Back returns to food home, not the prior store.
   */
  replace?: boolean;
};

/**
 * Open restaurant detail with an instant full-screen shutter Modal.
 * show() first → one frame for Modal to present → then push/replace + prefetch.
 */
export function navigateToMerchant(
  router: Router,
  queryClient: QueryClient,
  merchantId: string,
  merchant?: MerchantSummary,
  options?: NavigateToMerchantOptions
): void {
  if (!merchantId) return;
  const now = Date.now();
  if (now < navigateLockUntil) return;
  navigateLockUntil = now + 700;

  const isGrocery = (merchant?.storeType ?? "").trim().toUpperCase() === "GROCERY";
  const discovery = !isGrocery && peekCachedFoodHomeLayoutKey() === "discovery";
  const replace = options?.replace === true;

  // 1) Shutter Modal first — must beat the native stack paint.
  useMerchantNavTransitionStore.getState().show(merchantId, { dark: discovery });
  useScreenChromeStore.setState({
    statusBarBackground: discovery ? "#121212" : "#FFFFFF",
    statusBarStyle: discovery ? "light" : "dark",
    hideStatusBarSpacer: false,
  });

  // 2) Seed cached menu if we already have one. Never write an empty-menu
  // shell as query *data* — that marks the query successful, skips the fetch,
  // and the inner page paints a white blank instead of menu rows.
  seedMerchantMenuQueryIfCached(queryClient, merchantId);

  // 3) Navigate after Modal can present this frame.
  requestAnimationFrame(() => {
    const route = {
      pathname: "/home/merchant/[id]" as const,
      params: buildMerchantDetailParams(merchantId, merchant),
    };
    if (replace) {
      router.replace(route);
    } else {
      router.push(route);
    }
    prefetchMerchantDetail(queryClient, merchantId);
  });
}

/** Warm / pressIn — show shutter immediately on intentional press-down. */
export function showMerchantNavShutter(merchantId: string): void {
  if (!merchantId) return;
  useMerchantNavTransitionStore.getState().show(merchantId);
  const discovery = peekCachedFoodHomeLayoutKey() === "discovery";
  useScreenChromeStore.setState({
    statusBarBackground: discovery ? "#121212" : "#FFFFFF",
    statusBarStyle: discovery ? "light" : "dark",
    hideStatusBarSpacer: false,
  });
}

/** Cancel pressIn shutter if the gesture became a scroll. */
export function cancelMerchantNavShutter(merchantId?: string): void {
  const nav = useMerchantNavTransitionStore.getState();
  if (!nav.active) return;
  if (merchantId && nav.merchantId && nav.merchantId !== merchantId) return;
  nav.hide();
}
