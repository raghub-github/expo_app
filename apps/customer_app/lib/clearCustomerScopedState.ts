/**
 * Single teardown for every piece of customer-specific device-local state.
 *
 * Called on logout, session revoke, and account switch. One function on purpose:
 * a per-call-site checklist is how the floating Track pill ended up rendering a
 * previous account's order — the my-orders disk cache had no owner and nothing
 * cleared it. Anything new that caches customer data belongs in this list.
 *
 * Complements (does not replace) the owner stamps in @/lib/customerScope, which
 * cover the force-close/crash paths where this teardown never gets to run.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { STORAGE_KEYS } from "@/constants";
import { removeItem as removeSecureItem } from "@/utils/storage";
import { queryClient } from "@/lib/queryClient";
import { setActiveCustomerScopeId } from "@/lib/customerScope";
import { clearCachedProfile } from "@/lib/profileCache";
import { clearCachedStoreBookmarks } from "@/lib/storeBookmarkCache";
import { clearWalletBalanceCache } from "@/lib/walletBalanceCache";
import { clearCachedMyOrders } from "@/lib/myOrdersCache";
import { clearActivePersonRideIds } from "@/lib/active-person-ride-persist";
import { clearDismissedNotificationIds } from "@/lib/dismissedNotifications";
import { resetActiveLocationReconcileGate } from "@/lib/activeLocationReconcileGate";
import { useOrderStore } from "@/store/orderStore";
import { useCartStore } from "@/store/cartStore";
import { useShopCartStore } from "@/store/shopCartStore";
import { useCheckoutOfferStore } from "@/store/checkoutOfferStore";
import { useCheckoutAddressHandoffStore } from "@/store/checkoutAddressHandoffStore";
import { useCheckoutSheetStore } from "@/store/checkoutSheetStore";
import { useCartCheckoutGateStore } from "@/store/cartCheckoutGateStore";
import { useRecentSearchStore } from "@/store/recentSearchStore";
import { useRecentLocationStore } from "@/store/recentLocationStore";
import { useLocationStore } from "@/store/locationStore";
import { useParcelBookingStore } from "@/features/parcel/parcelBookingStore";

/** In-memory customer state: active orders, carts, checkout handoffs. */
function clearInMemoryCustomerStores(): void {
  useOrderStore.getState().clearActiveOrder();
  useCartStore.getState().clearCart();
  useShopCartStore.getState().clearCart();
  useCheckoutOfferStore.getState().setPending(null);
  useCheckoutAddressHandoffStore.getState().clear();
  useCheckoutSheetStore.getState().hide();
  useCartCheckoutGateStore.getState().hide();
  useRecentSearchStore.getState().clearRecentSearches();
  useRecentLocationStore.getState().clearRecentLocations();
  useParcelBookingStore.getState().clear();
}

/** Location pin + the reconcile gate that would otherwise re-pin the old address. */
async function clearLocationSessionState(): Promise<void> {
  resetActiveLocationReconcileGate();
  useLocationStore.setState({
    coords: null,
    address: null,
    locationSource: null,
    sessionSelectionKind: null,
    sessionBoundAddressId: null,
    locationHydrated: false,
  });
  await useLocationStore.getState().clearPersistedSelection();
}

/**
 * Disk caches holding customer-specific payloads.
 *
 * Backends differ per key and are NOT interchangeable — CART/SHOP_CART/
 * PROFILE_OFFLINE are written through SecureStore (@/utils/storage) while the
 * rest live in AsyncStorage. Clearing one through the other silently no-ops and
 * leaves the previous customer's data on disk.
 */
async function clearPersistedCustomerCaches(): Promise<void> {
  clearCachedMyOrders();
  clearActivePersonRideIds();
  clearCachedStoreBookmarks();
  await Promise.all([
    clearCachedProfile(),
    clearWalletBalanceCache(),
    clearDismissedNotificationIds(),
    removeSecureItem(STORAGE_KEYS.CART),
    removeSecureItem(STORAGE_KEYS.SHOP_CART),
    removeSecureItem(STORAGE_KEYS.PROFILE_OFFLINE),
    AsyncStorage.multiRemove([
      STORAGE_KEYS.SUBSCRIPTION_PLANS_CACHE,
      STORAGE_KEYS.SAVED_DELIVERY_TIP,
    ]).catch(() => {}),
  ]);
}

/**
 * Wipe everything tied to the outgoing customer and rebind local caches to
 * `nextCustomerId` (null on logout). Every step is best-effort: one failing
 * clear must not leave the rest of the previous account's data in place.
 *
 * Order matters — the scope is rebound first so any cache write racing this
 * teardown is stamped for the new owner (or refused when signed out).
 */
export async function clearCustomerScopedState(
  nextCustomerId: string | null = null
): Promise<void> {
  setActiveCustomerScopeId(nextCustomerId);

  try {
    clearInMemoryCustomerStores();
  } catch (e) {
    console.warn("[CustomerScope] in-memory clear failed:", e);
  }

  try {
    // Drops every cached response — no customer-specific query key is trusted
    // across an account boundary.
    queryClient.clear();
  } catch (e) {
    console.warn("[CustomerScope] query cache clear failed:", e);
  }

  try {
    await clearLocationSessionState();
  } catch (e) {
    console.warn("[CustomerScope] location clear failed:", e);
  }

  try {
    await clearPersistedCustomerCaches();
  } catch (e) {
    console.warn("[CustomerScope] persisted cache clear failed:", e);
  }
}
