/**
 * Subscribe to Supabase realtime for merchant_stores UPDATE (mounted once, app-wide).
 *
 * The backend schedule engine writes operational_status / is_active / is_available /
 * is_accepting_orders and next_open_at / next_close_at on merchant_stores on every
 * open/close transition (manual toggle, auto schedule, lock, vacation) AND after
 * operating-hours edits (schedule-tick). merchant_stores is in the
 * `supabase_realtime` publication with a public SELECT policy, so the anon client
 * receives these UPDATE events and the customer sees a store flip OPEN/CLOSED —
 * and its "opens at / closes at" time — within ~1s, without a manual refresh.
 *
 * Feeds:
 *   - storeStatusStore.statusMap  → list cards + detail chip (OPEN/CLOSED)
 *   - merchant list/search caches → nextOpenAt / nextCloseAt (badge timing)
 *   - merchant detail query cache → MerchantClosedBanner "opens at" / "closes at"
 *
 * No-ops when EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY are not set.
 */

import { useEffect } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { getConfig } from "@/config/env";
import {
  useStoreStatusStore,
  computeLiveStatusFromRow,
  type LiveStatus,
} from "@/store/storeStatusStore";
import { patchMerchantDetailLiveStatus } from "@/lib/patchMerchantLiveStatus";
import { STORE_LIVE_STATUS_QUERY_KEY } from "@/hooks/useStoreDetailLiveStatus";
import { MERCHANT_DETAIL_QUERY_KEY } from "@/lib/merchantMenuCache";
import type { MerchantSummary } from "@/services/merchant.service";

type RealtimePayloadRow = {
  /** merchant_stores primary key (numeric). */
  id?: number | string | null;
  /** Public store code (GMMC…) — this is what customer list/detail use as `merchant.id`. */
  store_id?: string | null;
  is_active?: boolean | null;
  is_available?: boolean | null;
  is_accepting_orders?: boolean | null;
  operational_status?: string | null;
  approval_status?: string | null;
  status?: string | null;
  next_open_at?: string | null;
  next_close_at?: string | null;
  live_schedule_phase?: string | null;
  /** Flips when the last sellable item disappears / first sellable item appears. */
  has_customer_visible_menu?: boolean | null;
};

/** Last schedule signature per public store_id — skip no-op 30s-tick heartbeats. */
const lastScheduleSigByStoreId = new Map<string, string>();

function scheduleSignature(
  liveStatus: LiveStatus,
  nextOpenAt: string | null,
  nextCloseAt: string | null,
  phase: string | null
): string {
  return `${liveStatus}|${nextOpenAt ?? ""}|${nextCloseAt ?? ""}|${phase ?? ""}`;
}

/** Patch every merchants/search list cache entry for this public store id. */
function patchMerchantListCaches(
  queryClient: QueryClient,
  publicStoreId: string,
  patch: {
    liveStatus: LiveStatus;
    nextOpenAt: string | null;
    nextCloseAt: string | null;
  }
): boolean {
  let touched = false;
  const apply = (old: unknown): unknown => {
    if (!Array.isArray(old)) return old;
    let changed = false;
    const next = (old as MerchantSummary[]).map((m) => {
      if (String(m.id) !== publicStoreId) return m;
      changed = true;
      return {
        ...m,
        isOpen: patch.liveStatus === "OPEN",
        nextOpenAt: patch.nextOpenAt,
        nextCloseAt: patch.nextCloseAt,
        // Drop backend-formatted label so the card rebuilds from the fresh
        // nextOpenAt / nextCloseAt immediately (no wait for list refetch).
        statusMessage: null,
      };
    });
    if (changed) touched = true;
    return changed ? next : old;
  };

  queryClient.setQueriesData({ queryKey: ["merchants"] }, apply);
  queryClient.setQueriesData({ queryKey: ["search"] }, apply);
  return touched;
}

/** Drop a delisted/inactive store from Home + Search lists immediately. */
function removeMerchantFromListCaches(queryClient: QueryClient, publicStoreId: string): boolean {
  let touched = false;
  const apply = (old: unknown): unknown => {
    if (!Array.isArray(old)) return old;
    const next = (old as MerchantSummary[]).filter((m) => String(m.id) !== publicStoreId);
    if (next.length !== (old as MerchantSummary[]).length) {
      touched = true;
      return next;
    }
    return old;
  };
  queryClient.setQueriesData({ queryKey: ["merchants"] }, apply);
  queryClient.setQueriesData({ queryKey: ["search"] }, apply);
  return touched;
}

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
          // Customer surfaces key by public store_id (GMMC…), not numeric PK.
          const publicStoreId =
            row?.store_id != null && String(row.store_id).trim() !== ""
              ? String(row.store_id).trim()
              : row?.id != null
                ? String(row.id)
                : "";
          if (!publicStoreId) return;

          const approval = String(row.approval_status ?? "").toUpperCase();
          const rowStatus = String(row.status ?? "").toUpperCase();
          const hiddenFromCustomers =
            approval === "DELISTED" ||
            rowStatus === "INACTIVE" ||
            rowStatus === "DELISTED";

          const liveStatus: LiveStatus = hiddenFromCustomers
            ? "CLOSED"
            : computeLiveStatusFromRow({
            is_active: row.is_active,
            is_available: row.is_available,
            is_accepting_orders: row.is_accepting_orders,
            operational_status: row.operational_status,
          });

          // When open, next_open is meaningless; when closed, next_close is.
          const nextOpenAt = liveStatus === "OPEN" ? null : row.next_open_at ?? null;
          const nextCloseAt = liveStatus === "OPEN" ? row.next_close_at ?? null : null;
          const phase =
            row.live_schedule_phase != null ? String(row.live_schedule_phase) : null;

          const prevStatus = useStoreStatusStore.getState().getStatus(publicStoreId);
          setStatus(publicStoreId, liveStatus);

          if (hiddenFromCustomers) {
            removeMerchantFromListCaches(queryClient, publicStoreId);
            void queryClient.invalidateQueries({ queryKey: ["merchants"] });
            void queryClient.invalidateQueries({ queryKey: ["search"] });
            void queryClient.invalidateQueries({ queryKey: ["food-home"] });
            void queryClient.removeQueries({
              queryKey: MERCHANT_DETAIL_QUERY_KEY(publicStoreId),
            });
          }

          const sig = scheduleSignature(liveStatus, nextOpenAt, nextCloseAt, phase);
          const prevSig = lastScheduleSigByStoreId.get(publicStoreId);
          const scheduleChanged = prevSig !== sig;
          if (scheduleChanged) {
            lastScheduleSigByStoreId.set(publicStoreId, sig);
          }

          // OPEN/CLOSED flip OR hours/slot rewrite (same status, new next_open_at).
          // Patch list caches in place for instant badge timing; invalidate so the
          // next quiet moment also picks up the backend-formatted statusMessage.
          if (scheduleChanged) {
            patchMerchantListCaches(queryClient, publicStoreId, {
              liveStatus,
              nextOpenAt,
              nextCloseAt,
            });
            // Status flip OR hours rewrite: refetch active list/search so
            // backend-formatted statusMessage replaces the patched times.
            // Signature dedupe skips identical 30s-tick heartbeats.
            if (prevStatus != null && prevStatus !== liveStatus) {
              void queryClient.invalidateQueries({ queryKey: ["merchants"] });
              void queryClient.invalidateQueries({ queryKey: ["search"] });
            } else if (prevSig != null) {
              void queryClient.invalidateQueries({ queryKey: ["merchants"] });
              void queryClient.invalidateQueries({ queryKey: ["search"] });
            }
          }

          // Catalog empty ↔ non-empty: store must appear/disappear on Home/Search instantly.
          const hasVisible = row.has_customer_visible_menu;
          if (hasVisible === false) {
            void queryClient.invalidateQueries({ queryKey: ["merchants"] });
            void queryClient.invalidateQueries({ queryKey: ["search"] });
            void queryClient.invalidateQueries({ queryKey: ["food-home"] });
            void queryClient.removeQueries({
              queryKey: MERCHANT_DETAIL_QUERY_KEY(publicStoreId),
            });
          } else if (hasVisible === true) {
            void queryClient.invalidateQueries({ queryKey: ["merchants"] });
            void queryClient.invalidateQueries({ queryKey: ["search"] });
            void queryClient.invalidateQueries({ queryKey: ["food-home"] });
          }

          // Only touch the query caches for a store the user actually has in
          // view (avoids a persisted-cache read on every platform-wide event).
          const hasDetail =
            queryClient.getQueryData(MERCHANT_DETAIL_QUERY_KEY(publicStoreId)) != null;
          const hasLiveQuery =
            queryClient.getQueryData(STORE_LIVE_STATUS_QUERY_KEY(publicStoreId)) != null;
          if (hasDetail || hasLiveQuery) {
            patchMerchantDetailLiveStatus(queryClient, publicStoreId, {
              liveStatus,
              nextOpenAt,
              nextCloseAt,
            });
            if (hasLiveQuery) {
              queryClient.setQueryData(STORE_LIVE_STATUS_QUERY_KEY(publicStoreId), {
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
