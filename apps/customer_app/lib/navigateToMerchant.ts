import type { Router } from "expo-router";
import type { QueryClient } from "@tanstack/react-query";
import type { MerchantDetail, MerchantSummary } from "@/services/merchant.service";
import { buildMerchantDetailParams } from "@/lib/merchantHeroWarmCache";
import {
  getMerchantDetailPlaceholder,
  MERCHANT_DETAIL_QUERY_KEY,
  merchantSummaryToDetailPlaceholder,
  prefetchMerchantDetail,
} from "@/lib/prefetchMerchantDetail";
import { seedMerchantMenuQueryIfCached } from "@/lib/merchantMenuCache";
import { useScreenChromeStore } from "@/store/screenChromeStore";
import { useMerchantNavTransitionStore } from "@/store/merchantNavTransitionStore";
import { peekCachedFoodHomeLayoutKey } from "@/lib/foodHomeLayoutCache";

/**
 * Open restaurant detail with an instant full-screen shutter Modal.
 * show() first → one frame for Modal to present → then push + prefetch.
 */
export function navigateToMerchant(
  router: Router,
  queryClient: QueryClient,
  merchantId: string,
  merchant?: MerchantSummary
): void {
  if (!merchantId) return;

  const isGrocery = (merchant?.storeType ?? "").trim().toUpperCase() === "GROCERY";
  const discovery = !isGrocery && peekCachedFoodHomeLayoutKey() === "discovery";

  // 1) Shutter Modal first — must beat the native stack paint.
  useMerchantNavTransitionStore.getState().show(merchantId, { dark: discovery });
  useScreenChromeStore.setState({
    statusBarBackground: discovery ? "#121212" : "#FFFFFF",
    statusBarStyle: discovery ? "light" : "dark",
    hideStatusBarSpacer: false,
  });

  // 2) Seed shell data for first merchant paint (under the Modal).
  const key = MERCHANT_DETAIL_QUERY_KEY(merchantId);
  seedMerchantMenuQueryIfCached(queryClient, merchantId);
  const existing = queryClient.getQueryData<MerchantDetail>(key);
  if (!existing?.menu?.length) {
    const placeholder = merchant
      ? merchantSummaryToDetailPlaceholder(merchant)
      : getMerchantDetailPlaceholder(queryClient, merchantId);
    if (placeholder) {
      queryClient.setQueryData(key, placeholder);
    }
  }

  // 3) Push after Modal can present this frame.
  requestAnimationFrame(() => {
    router.push({
      pathname: "/home/merchant/[id]",
      params: buildMerchantDetailParams(merchantId, merchant),
    });
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
