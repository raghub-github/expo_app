import type { Router } from "expo-router";
import type { QueryClient } from "@tanstack/react-query";
import type { MerchantSummary } from "@/services/merchant.service";
import { buildMerchantDetailParams } from "@/lib/merchantHeroWarmCache";
import { prefetchMerchantDetail } from "@/lib/prefetchMerchantDetail";
import { useMerchantNavTransitionStore } from "@/store/merchantNavTransitionStore";
import { useScreenChromeStore } from "@/store/screenChromeStore";

/** Paint skeleton shutter immediately (e.g. onPressIn before navigation). */
export function showMerchantNavShutter(merchantId: string): void {
  if (!merchantId) return;
  useScreenChromeStore.getState().setStatusBarBackground("#FFFFFF", "dark");
  useMerchantNavTransitionStore.getState().show(merchantId);
}

/** Tap store card → instant skeleton shutter + warm cache + push merchant route. */
export function navigateToMerchant(
  router: Router,
  queryClient: QueryClient,
  merchantId: string,
  merchant?: MerchantSummary
): void {
  if (!merchantId) return;

  showMerchantNavShutter(merchantId);
  prefetchMerchantDetail(queryClient, merchantId);

  // Let Modal paint + start slide before native route push (avoids white gap on the right).
  requestAnimationFrame(() => {
    router.push({
      pathname: "/home/merchant/[id]",
      params: buildMerchantDetailParams(merchantId, merchant),
    });
  });
}
