/**
 * Subscribe to Supabase realtime for merchant_stores UPDATE (mounted once, app-wide).
 *
 * The backend schedule engine writes operational_status / is_active / is_available /
 * is_accepting_orders and next_open_at / next_close_at on merchant_stores on every
 * open/close transition (manual toggle, auto schedule, lock, vacation). merchant_stores
 * is in the `supabase_realtime` publication with a public SELECT policy, so the anon
 * client receives these UPDATE events and the customer sees a store flip OPEN/CLOSED —
 * and its "opens at / closes at" time — within ~1s, without a manual refresh.
 *
 * Feeds:
 *   - storeStatusStore.statusMap  → list cards + detail chip (OPEN/CLOSED)
 *   - merchant detail query cache → MerchantClosedBanner "opens at" / "closes at" timing
 *
 * No-ops when EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY are not set.
 */

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getConfig } from "@/config/env";
import {
  useStoreStatusStore,
  computeLiveStatusFromRow,
  type LiveStatus,
} from "@/store/storeStatusStore";
import { patchMerchantDetailLiveStatus } from "@/lib/patchMerchantLiveStatus";
import { STORE_LIVE_STATUS_QUERY_KEY } from "@/hooks/useStoreDetailLiveStatus";
import { MERCHANT_DETAIL_QUERY_KEY } from "@/lib/merchantMenuCache";

type RealtimePayloadRow = {
  /** merchant_stores primary key. NOTE: the column is `id`, not `store_id`. */
  id?: number | string | null;
  is_active?: boolean | null;
  is_available?: boolean | null;
  is_accepting_orders?: boolean | null;
  operational_status?: string | null;
  next_open_at?: string | null;
  next_close_at?: string | null;
};

export function useStoreStatusRealtime() {
  const setStatus = useStoreStatusStore((s) => s.setStatus);
  const queryClient = useQueryClient();

  useEffect(() => {
    const { supabaseUrl, supabaseAnonKey } = getConfig();
    if (!supabaseUrl || !supabaseAnonKey) return;

    let client: import("@supabase/supabase-js").SupabaseClient;
    try {
      const { createClient } = require("@supabase/supabase-js");
      client = createClient(supabaseUrl, supabaseAnonKey);
    } catch {
      return;
    }

    const channel = client
      .channel("store-status")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "merchant_stores",
        },
        (payload: { new: RealtimePayloadRow }) => {
          const row = payload?.new;
          if (row?.id == null) return;
          const storeId = String(row.id);
          if (!storeId) return;

          const liveStatus: LiveStatus = computeLiveStatusFromRow({
            is_active: row.is_active,
            is_available: row.is_available,
            is_accepting_orders: row.is_accepting_orders,
            operational_status: row.operational_status,
          });

          // When open, next_open is meaningless; when closed, next_close is.
          const nextOpenAt = liveStatus === "OPEN" ? null : row.next_open_at ?? null;
          const nextCloseAt = liveStatus === "OPEN" ? row.next_close_at ?? null : null;

          // OPEN/CLOSED chip everywhere (list, card, detail). setStatus is a
          // no-op when the value is unchanged, so 30s-tick heartbeat writes are cheap.
          setStatus(storeId, liveStatus);

          // Only touch the query caches for a store the user actually has in
          // view (avoids a persisted-cache read on every platform-wide event).
          // Keeps the closed banner's "opens at HH:MM" live and stops a later
          // focus refetch from momentarily reverting what realtime applied.
          const hasDetail =
            queryClient.getQueryData(MERCHANT_DETAIL_QUERY_KEY(storeId)) != null;
          const hasLiveQuery =
            queryClient.getQueryData(STORE_LIVE_STATUS_QUERY_KEY(storeId)) != null;
          if (hasDetail || hasLiveQuery) {
            patchMerchantDetailLiveStatus(queryClient, storeId, {
              liveStatus,
              nextOpenAt,
              nextCloseAt,
            });
            if (hasLiveQuery) {
              queryClient.setQueryData(STORE_LIVE_STATUS_QUERY_KEY(storeId), {
                liveStatus,
                nextOpenAt,
                nextCloseAt,
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      try {
        client.removeChannel(channel);
      } catch {}
    };
  }, [setStatus, queryClient]);
}
