/**
 * After the active delivery pin changes, cart may become unserviceable.
 * Do NOT auto-open Outside Delivery Range — keep the floating cart visible.
 * The gate opens only when the user taps View Cart / Continue (see tryNavigateToFoodCheckout).
 */

import type { QueryClient } from "@tanstack/react-query";
import { evaluateCartCheckoutEligibility } from "@/lib/cartCheckoutGate";
import { useCartStore } from "@/store/cartStore";

export async function promptCartIfLocationBrokeServiceability(
  queryClient: QueryClient
): Promise<void> {
  if (useCartStore.getState().items.length === 0) return;

  try {
    const eligibility = await evaluateCartCheckoutEligibility(queryClient);
    if (!eligibility.allowed && eligibility.reason !== "empty_cart") {
      if (__DEV__) {
        console.log("[active-location] cart_unserviceable_deferred", {
          path: "promptCartIfLocationBrokeServiceability",
          reason: eligibility.reason ?? null,
          note: "gate deferred until View Cart / Continue",
        });
      }
    }
  } catch {
    // Network failure: do not block or clear cart.
  }
}
