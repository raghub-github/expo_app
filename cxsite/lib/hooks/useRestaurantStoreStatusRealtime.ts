'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'

/**
 * Live store open/closed + operating hours for a restaurant page.
 * Debounced ~300ms so OPEN/CLOSED flips feel instant without request storms.
 */
export function useRestaurantStoreStatusRealtime(
  restaurantId: string | null | undefined,
  storeNumericId: number | null | undefined,
  onStoreChange: () => void
) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const callbackRef = useRef(onStoreChange)
  callbackRef.current = onStoreChange

  useEffect(() => {
    if (!restaurantId || storeNumericId == null || storeNumericId < 1) return

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!supabaseUrl || !supabaseAnonKey) return

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    const scheduleRefresh = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        callbackRef.current()
      }, 300)
    }

    const channel = supabase
      .channel(`cx-store-status-${restaurantId}-${storeNumericId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'merchant_stores',
          filter: `id=eq.${storeNumericId}`,
        },
        () => scheduleRefresh()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'merchant_store_operating_hours',
          filter: `store_id=eq.${storeNumericId}`,
        },
        () => scheduleRefresh()
      )
      .subscribe()

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      try {
        supabase.removeChannel(channel)
      } catch {
        /* ignore */
      }
    }
  }, [restaurantId, storeNumericId])
}
