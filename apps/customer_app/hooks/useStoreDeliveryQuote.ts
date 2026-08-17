/**
 * useStoreDeliveryQuote — single source of truth for distance / delivery-fee / serviceability.
 *
 * Every screen that shows a store MUST use this hook (home, search, store details, cart,
 * checkout, order details, tracking). The hook calls the canonical backend engine
 * `POST /v1/distance/store-quote` so all pages render the SAME numbers for the same
 * (storeId, addressId|coords) tuple during a session.
 *
 * Backend semantics:
 *   - Mapbox Directions (lng,lat) → OSRM → Haversine × 1.3 fallback
 *   - (store_id, customer_address_id) cached via distance.service memory + DB cache
 *   - delivery_fee: geo slab engine with cumulative/progressive slabs
 *     (base once + per-segment km rates, monotonic by distance); fallback to env base+per_km.
 *   - delivery_gst applied when APPLY_GST_ON_DELIVERY_FEE=true.
 *   - serviceable: haversine(store, drop) <= store.delivery_radius_km (else SERVICE_RADIUS_KM_DEFAULT).
 */

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { getStoreDeliveryQuote, type StoreDeliveryQuote } from "@/services/distance.service";

export type UseStoreDeliveryQuoteInput = {
  storeId: string | null | undefined;
  /** Customer delivery address id (preferred; canonical) */
  addressId?: number | null;
  /** Fallback drop coordinates (e.g. guest/home-with-map-pin before an address is saved). */
  drop?: { lat: number; lng: number; pincode?: string | null; city?: string | null } | null;
  actor?: "customer" | "rider";
  serviceType?: "FOOD" | "PARCEL" | "RIDE";
  /** Bypass backend (memory + DB) distance cache when true. */
  skipCache?: boolean;
  /** Keep stale numbers for 5 minutes so distance doesn't jitter between pages. */
  staleMs?: number;
  enabled?: boolean;
};

export function useStoreDeliveryQuote(
  input: UseStoreDeliveryQuoteInput
): UseQueryResult<StoreDeliveryQuote, Error> {
  const storeId = input.storeId?.trim() || "";
  const addressId = input.addressId ?? null;
  const dropLat = input.drop?.lat ?? null;
  const dropLng = input.drop?.lng ?? null;
  const dropPin = input.drop?.pincode ?? null;
  const actor = input.actor ?? "customer";
  const serviceType = input.serviceType ?? "FOOD";
  const skipCache = input.skipCache === true;

  const enabled =
    !!storeId &&
    (addressId != null || (dropLat != null && dropLng != null)) &&
    input.enabled !== false;

  return useQuery<StoreDeliveryQuote, Error>({
    queryKey: [
      "store-delivery-quote",
      storeId,
      addressId,
      dropLat,
      dropLng,
      dropPin,
      actor,
      serviceType,
      skipCache,
    ],
    enabled,
    staleTime: skipCache ? 0 : (input.staleMs ?? 5 * 60 * 1000),
    gcTime: 15 * 60 * 1000,
    refetchOnMount: skipCache ? "always" : false,
    refetchOnWindowFocus: skipCache ? "always" : false,
    queryFn: () =>
      getStoreDeliveryQuote({
        storeId,
        addressId: addressId ?? undefined,
        drop:
          addressId == null && dropLat != null && dropLng != null
            ? { lat: dropLat, lng: dropLng, pincode: dropPin ?? undefined }
            : undefined,
        actor,
        serviceType,
        skipCache,
      }),
  });
}
