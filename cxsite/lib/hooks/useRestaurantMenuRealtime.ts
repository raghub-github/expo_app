'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

/**
 * Subscribes to live menu table changes via Supabase postgres_changes and
 * calls `onMenuChange` (debounced 400 ms) so the restaurant page can silently
 * refetch the menu without a full-page reload.
 *
 * Subscribes to:
 *   - merchant_menu_items      – price, stock, name, approval, description
 *   - merchant_menu_categories – category stock / activation
 *   - merchant_menu_item_images – image approval / replacement
 *
 * When storeNumericId is provided the items + categories channels use a
 * server-side row filter (`store_id=eq.<n>`) so only changes for THIS store
 * wake the callback. Images are not directly store-keyed so they subscribe
 * unfiltered.
 */
export function useRestaurantMenuRealtime(
  restaurantId: string | null | undefined,
  storeNumericId: number | null | undefined,
  onMenuChange: () => void
) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(onMenuChange);
  callbackRef.current = onMenuChange;

  useEffect(() => {
    if (!restaurantId) return;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) return;

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const scheduleRefresh = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        callbackRef.current();
      }, 400);
    };

    const filter =
      storeNumericId != null ? `store_id=eq.${storeNumericId}` : undefined;

    const channelName =
      storeNumericId != null
        ? `cx-menu-${restaurantId}-${storeNumericId}`
        : `cx-menu-${restaurantId}`;

    const itemsListener = filter
      ? { event: '*' as const, schema: 'public', table: 'merchant_menu_items', filter }
      : { event: '*' as const, schema: 'public', table: 'merchant_menu_items' };

    const categoriesListener = filter
      ? { event: '*' as const, schema: 'public', table: 'merchant_menu_categories', filter }
      : { event: '*' as const, schema: 'public', table: 'merchant_menu_categories' };

    const imagesListener = {
      event: '*' as const,
      schema: 'public',
      table: 'merchant_menu_item_images',
    };

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', itemsListener, () => scheduleRefresh())
      .on('postgres_changes', categoriesListener, () => scheduleRefresh())
      .on('postgres_changes', imagesListener, () => scheduleRefresh())
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      try {
        supabase.removeChannel(channel);
      } catch {}
    };
  }, [restaurantId, storeNumericId]);
}
