'use client'

import { useEffect, useRef } from 'react'
import { createClient, type RealtimePostgresChangesPayload } from '@supabase/supabase-js'

export type MenuRealtimeChange = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE' | '*'
  table: 'merchant_menu_items' | 'merchant_menu_categories'
  /** New/updated row for INSERT/UPDATE; old row for DELETE when available. */
  row: Record<string, unknown> | null
}

type MenuChangeHandler = (change: MenuRealtimeChange) => void

/**
 * Store-scoped Supabase realtime for live menu sync on cxsite store pages.
 * Passes the change payload so the UI can patch instantly, then optionally refetch.
 */
export function useRestaurantMenuRealtime(
  restaurantId: string | null | undefined,
  storeNumericId: number | null | undefined,
  onMenuChange: MenuChangeHandler
) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef<MenuRealtimeChange | null>(null)
  const callbackRef = useRef(onMenuChange)
  callbackRef.current = onMenuChange

  useEffect(() => {
    if (!restaurantId || storeNumericId == null || storeNumericId < 1) return

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!supabaseUrl || !supabaseAnonKey) return

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    const schedule = (change: MenuRealtimeChange) => {
      pendingRef.current = change
      if (debounceRef.current) clearTimeout(debounceRef.current)
      // Short coalesce — feels instant, still batches burst updates.
      debounceRef.current = setTimeout(() => {
        const next = pendingRef.current
        pendingRef.current = null
        if (next) callbackRef.current(next)
      }, 280)
    }

    const filter = `store_id=eq.${storeNumericId}`
    const channelName = `cx-menu-${restaurantId}-${storeNumericId}`

    const onItems = (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
      const eventType = payload.eventType as MenuRealtimeChange['eventType']
      const row =
        (payload.new && Object.keys(payload.new).length > 0
          ? (payload.new as Record<string, unknown>)
          : null) ??
        (payload.old && Object.keys(payload.old as object).length > 0
          ? (payload.old as Record<string, unknown>)
          : null)
      schedule({ eventType, table: 'merchant_menu_items', row })
    }

    const onCategories = (
      payload: RealtimePostgresChangesPayload<Record<string, unknown>>
    ) => {
      const eventType = payload.eventType as MenuRealtimeChange['eventType']
      const row =
        (payload.new && Object.keys(payload.new).length > 0
          ? (payload.new as Record<string, unknown>)
          : null) ??
        (payload.old && Object.keys(payload.old as object).length > 0
          ? (payload.old as Record<string, unknown>)
          : null)
      schedule({ eventType, table: 'merchant_menu_categories', row })
    }

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'merchant_menu_items', filter },
        onItems
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'merchant_menu_categories', filter },
        onCategories
      )
      .subscribe()

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      pendingRef.current = null
      try {
        supabase.removeChannel(channel)
      } catch {
        /* ignore */
      }
    }
  }, [restaurantId, storeNumericId])
}
