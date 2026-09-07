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
 * Open restaurant detail immediately.
 * No full-screen shutter Modal — that painted a multi-second overlay on Food Home
 * before the stack settled. Destination paints its own shell/skeleton if needed.
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
  navigateLockUntil = now + 320;

  const isGrocery = (merchant?.storeType ?? "").trim().toUpperCase() === "GROCERY";
  const discovery = !isGrocery && peekCachedFoodHomeLayoutKey() === "discovery";
  const replace = options?.replace === true;

  useScreenChromeStore.setState({
    statusBarBackground: discovery ? "#121212" : "#FFFFFF",
    statusBarStyle: discovery ? "light" : "dark",
    hideStatusBarSpacer: false,
  });

  // Seed cached menu if we already have one. Never write an empty-menu
  // shell as query *data* — that marks the query successful, skips the fetch,
  // and the inner page paints a white blank instead of menu rows.
  seedMerchantMenuQueryIfCached(queryClient, merchantId);

  // Visit bookkeeping only — do NOT open the full-screen shutter Modal (Food Home blur).
  useMerchantNavTransitionStore.getState().beginVisit(merchantId, { dark: discovery });

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
}

/** @deprecated No-op — shutter overlay removed (caused Food Home blur/overlap). */
export function showMerchantNavShutter(merchantId: string): void {
  if (!merchantId) return;
  useMerchantNavTransitionStore.getState().beginVisit(merchantId);
}

/** Cancel pressIn shutter if the gesture became a scroll. */
export function cancelMerchantNavShutter(merchantId?: string): void {
  const nav = useMerchantNavTransitionStore.getState();
  if (!nav.active) return;
  if (merchantId && nav.merchantId && nav.merchantId !== merchantId) return;
  nav.hide();
}
