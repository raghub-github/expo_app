import { useEffect, useRef } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { getConfig } from "@/config/env";
import { syncMerchantMenuInBackground } from "@/lib/merchantMenuSync";
import { MERCHANT_DETAIL_QUERY_KEY } from "@/lib/merchantMenuCache";
import type { MerchantDetail } from "@/services/merchant.service";
import { menuItemConfigQueryKey } from "@/lib/menu-item-config-query";
import { clearCachedMenuItemFullConfig } from "@/lib/menu-item-config-cache";

/**
 * Invalidates the React Query + in-memory full-config cache for every item in
 * the cached menu. Called after a successful menu sync so that modifier/price
 * sheets reflect the latest data rather than the 15-minute cache.
 */
function invalidateItemFullConfigCache(
  queryClient: QueryClient,
  merchantId: string
): void {
  const detail = queryClient.getQueryData<MerchantDetail>(
    MERCHANT_DETAIL_QUERY_KEY(merchantId)
  );
  if (!detail?.menu?.length) return;
  for (const item of detail.menu) {
    // item.id is the public item_id string; menuItemId is the numeric PK.
    const ids = [String(item.id ?? "").trim(), String(item.menuItemId ?? "")].filter(Boolean);
    for (const itemId of ids) {
      clearCachedMenuItemFullConfig(merchantId, itemId);
      queryClient.removeQueries({ queryKey: menuItemConfigQueryKey(merchantId, itemId) });
    }
  }
}

/**
 * Supabase realtime for live menu sync — debounced delta sync while a store screen is mounted.
 *
 * Subscribes to:
 *   - merchant_menu_items      (items: price, stock, name, approval, description)
 *   - merchant_menu_categories (categories: display, stock, activation)
 *   - merchant_menu_item_images (image approval / replacement)
 *
 * All channels are filtered by the store's numeric PK when available so a
 * customer with multiple tabs / background stores does not trigger redundant
 * syncs for the wrong merchant.
 *
 * On any change: 400ms debounce → syncMerchantMenuInBackground (version check
 * + delta merge). After a successful sync, full-config cache is cleared so
 * modifier / price sheets always show fresh data.
 */
export function useMerchantMenuRealtime(
  merchantId: string | undefined,
  queryClient: QueryClient
) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!merchantId) return;

    const { supabaseUrl, supabaseAnonKey } = getConfig();
    if (!supabaseUrl || !supabaseAnonKey) return;

    let client: import("@supabase/supabase-js").SupabaseClient;
    try {
      const { createClient } = require("@supabase/supabase-js");
      client = createClient(supabaseUrl, supabaseAnonKey);
    } catch {
      return;
    }

    // Resolve numeric store PK for store-scoped filter (prevents syncing other stores).
    const detail = queryClient.getQueryData<MerchantDetail>(
      MERCHANT_DETAIL_QUERY_KEY(merchantId)
    );
    const storeNumericId = detail?.storeNumericId;
    const filter = storeNumericId != null ? `store_id=eq.${storeNumericId}` : undefined;

    const scheduleSync = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        await syncMerchantMenuInBackground(queryClient, merchantId);
        // Bust full-config cache so modifier sheets pick up modifier/price changes.
        invalidateItemFullConfigCache(queryClient, merchantId);
      }, 400);
    };

    const channelName = storeNumericId != null
      ? `merchant-menu-${merchantId}-${storeNumericId}`
      : `merchant-menu-${merchantId}`;

    const itemsListener = filter
      ? { event: "*" as const, schema: "public", table: "merchant_menu_items", filter }
      : { event: "*" as const, schema: "public", table: "merchant_menu_items" };
    const categoriesListener = filter
      ? { event: "*" as const, schema: "public", table: "merchant_menu_categories", filter }
      : { event: "*" as const, schema: "public", table: "merchant_menu_categories" };
    // Images don't have store_id directly — subscribe unfiltered but only when active.
    const imagesListener = { event: "*" as const, schema: "public", table: "merchant_menu_item_images" };

    const channel = client
      .channel(channelName)
      .on("postgres_changes", itemsListener, () => scheduleSync())
      .on("postgres_changes", categoriesListener, () => scheduleSync())
      .on("postgres_changes", imagesListener, () => scheduleSync())
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      try {
        client.removeChannel(channel);
      } catch {}
    };
  }, [merchantId, queryClient]);
}
