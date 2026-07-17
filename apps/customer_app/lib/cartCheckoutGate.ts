import type { QueryClient } from "@tanstack/react-query";
import type { Router } from "expo-router";
import { resolveCheckoutDeliveryAddress } from "@/lib/deliveryDropResolution";
import type { DeliveryDropContext } from "@/lib/bookmarkedMerchants";
import { getStoreDeliveryQuote, type StoreDeliveryQuote } from "@/services/distance.service";
import { addressService, type Address } from "@/services/address.service";
import { useCartStore } from "@/store/cartStore";
import { useLocationStore } from "@/store/locationStore";
import { useCartCheckoutGateStore } from "@/store/cartCheckoutGateStore";
import { ADDRESSES_QUERY_KEY, ACTIVE_LOCATION_QUERY_KEY } from "@/hooks/useAddresses";
import {
  captureCartDeliveryAnchor,
  isCartDeliveryAnchorMismatch,
  type CartDeliveryAnchor,
} from "@/lib/cartDeliveryAnchor";

export type CartCheckoutEligibility = {
  allowed: boolean;
  reason?: "out_of_range" | "location_mismatch" | "empty_cart";
};

function loadAddressesSync(queryClient: QueryClient): Address[] {
  return queryClient.getQueryData<Address[]>(ADDRESSES_QUERY_KEY) ?? [];
}

async function loadAddresses(queryClient: QueryClient): Promise<Address[]> {
  const cached = queryClient.getQueryData<Address[]>(ADDRESSES_QUERY_KEY);
  if (cached != null) return cached;
  try {
    const rows = await addressService.getAddresses();
    queryClient.setQueryData(ADDRESSES_QUERY_KEY, rows);
    return rows;
  } catch {
    return [];
  }
}

function resolveDeliveryDrop(
  addresses: Address[],
  queryClient: QueryClient
): DeliveryDropContext {
  const { coords, locationSource, address } = useLocationStore.getState();
  const activeLocation = queryClient.getQueryData<{
    latitude: number | null;
    longitude: number | null;
  } | null>(ACTIVE_LOCATION_QUERY_KEY);

  const resolved = resolveCheckoutDeliveryAddress(
    addresses,
    coords,
    locationSource,
    activeLocation ?? undefined
  );

  if (resolved) return { addressId: resolved.id };
  if (coords) {
    return {
      drop: {
        lat: coords.latitude,
        lng: coords.longitude,
        pincode: address?.pincode ?? null,
        city: address?.city ?? null,
      },
    };
  }
  return {};
}

function quoteQueryKey(merchantId: string, drop: DeliveryDropContext) {
  return [
    "store-delivery-quote",
    merchantId,
    drop.addressId ?? null,
    drop.drop?.lat ?? null,
    drop.drop?.lng ?? null,
    drop.drop?.pincode ?? null,
    "customer",
    "FOOD",
    false,
  ] as const;
}

function readCachedQuote(
  queryClient: QueryClient,
  merchantId: string,
  drop: DeliveryDropContext
): StoreDeliveryQuote | undefined {
  return queryClient.getQueryData<StoreDeliveryQuote>(quoteQueryKey(merchantId, drop));
}

/**
 * Synchronous eligibility only when we already know the answer.
 * Never guesses "out of range" from haversine — that falsely blocked serviceable stores.
 * Returns null when the store-quote API must decide.
 */
export function tryEvaluateCartCheckoutEligibilitySync(
  queryClient: QueryClient
): CartCheckoutEligibility | null {
  const { items, merchantId, deliveryAnchor } = useCartStore.getState();
  if (!merchantId || items.length === 0) {
    return { allowed: false, reason: "empty_cart" };
  }

  // Clear city/area change from where the cart was built.
  if (isCartDeliveryAnchorMismatch(deliveryAnchor)) {
    return { allowed: false, reason: "location_mismatch" };
  }

  const addresses = loadAddressesSync(queryClient);
  const drop = resolveDeliveryDrop(addresses, queryClient);
  if (!drop.addressId && !drop.drop) {
    return { allowed: true };
  }

  const cached = readCachedQuote(queryClient, merchantId, drop);
  if (cached != null) {
    return cached.serviceable
      ? { allowed: true }
      : { allowed: false, reason: "out_of_range" };
  }

  return null;
}

/** Authoritative gate — prefers cache, otherwise store-quote API. */
export async function evaluateCartCheckoutEligibility(
  queryClient: QueryClient
): Promise<CartCheckoutEligibility> {
  const sync = tryEvaluateCartCheckoutEligibilitySync(queryClient);
  if (sync != null) return sync;

  const { items, merchantId } = useCartStore.getState();
  if (!merchantId || items.length === 0) {
    return { allowed: false, reason: "empty_cart" };
  }

  const addresses = await loadAddresses(queryClient);
  const drop = resolveDeliveryDrop(addresses, queryClient);

  if (!drop.addressId && !drop.drop) {
    return { allowed: true };
  }

  try {
    const quote = await getStoreDeliveryQuote({
      storeId: merchantId,
      addressId: drop.addressId ?? undefined,
      drop: drop.drop ?? undefined,
      serviceType: "FOOD",
    });
    queryClient.setQueryData(quoteQueryKey(merchantId, drop), quote);
    if (!quote.serviceable) {
      return { allowed: false, reason: "out_of_range" };
    }
    return { allowed: true };
  } catch {
    // Network failure: do not block checkout with a false Outside Delivery Range screen.
    return { allowed: true };
  }
}

function openCheckoutOrGate(allowed: boolean, router: Router): boolean {
  if (allowed) {
    useCartCheckoutGateStore.getState().hide();
    router.push("/checkout" as never);
    return true;
  }
  useCartCheckoutGateStore.getState().show();
  return false;
}

/**
 * View Cart → one correct destination only.
 * Never flash Outside Delivery Range while waiting for a quote when the store is serviceable.
 */
export async function tryNavigateToFoodCheckout(
  router: Router,
  queryClient: QueryClient
): Promise<boolean> {
  const { items } = useCartStore.getState();
  if (items.length === 0) return false;

  const sync = tryEvaluateCartCheckoutEligibilitySync(queryClient);
  if (sync != null) {
    return openCheckoutOrGate(sync.allowed, router);
  }

  const eligibility = await evaluateCartCheckoutEligibility(queryClient);
  return openCheckoutOrGate(eligibility.allowed, router);
}

export async function tryOpenFoodCheckoutSheet(
  router: Router,
  queryClient: QueryClient
): Promise<boolean> {
  const { items } = useCartStore.getState();
  if (items.length === 0) return false;

  const sync = tryEvaluateCartCheckoutEligibilitySync(queryClient);
  if (sync != null) {
    if (!sync.allowed) {
      useCartCheckoutGateStore.getState().show();
      return false;
    }
    useCartCheckoutGateStore.getState().hide();
    return true;
  }

  const eligibility = await evaluateCartCheckoutEligibility(queryClient);
  if (!eligibility.allowed) {
    useCartCheckoutGateStore.getState().show();
    return false;
  }
  useCartCheckoutGateStore.getState().hide();
  return true;
}

export { captureCartDeliveryAnchor, isCartDeliveryAnchorMismatch, type CartDeliveryAnchor };
