import { useEffect, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseAuth } from "@/lib/supabaseClient";
import { fetchRealtimeAuthToken } from "@/services/ordersApi";
import { fetchWalletFreezeStatus, fetchWalletSummary } from "@/services/walletApi";
import { registerMerchantForegroundPushHandler } from "@/lib/merchantPushDispatch";
import { requestMerchantDashboardStatsRefresh } from "@/lib/merchantDashboardStatsBus";
import {
  MERCHANT_WALLET_FREEZE_EVENT,
  emitMerchantWalletFreeze,
  freezeStateFromUnknown,
  getMerchantWalletFreezeSnapshot,
  merchantWalletFreezeChannel,
  subscribeMerchantWalletFreeze,
  type MerchantWalletFreezeLiveState,
} from "@/lib/merchantWalletFreezeBus";

const POLL_MS = 30_000;

function applyFreeze(storeId: number, isFrozen: boolean, freezeReason: string | null): void {
  emitMerchantWalletFreeze({ storeId, isFrozen, freezeReason });
}

export function useMerchantWalletFreezeState(
  storeId: number | null | undefined,
): MerchantWalletFreezeLiveState | null {
  const [state, setState] = useState<MerchantWalletFreezeLiveState | null>(() =>
    getMerchantWalletFreezeSnapshot(storeId),
  );

  useEffect(() => {
    setState(getMerchantWalletFreezeSnapshot(storeId));
    return subscribeMerchantWalletFreeze((next) => {
      if (storeId != null && next.storeId === storeId) setState(next);
    });
  }, [storeId]);

  return state;
}

/**
 * Keeps freeze overlay live while the merchant is signed in.
 * Broadcast is instant; postgres_changes + 30s poll are backups.
 */
export function useMerchantWalletFreezeLive(options: {
  storeId: number | null;
  authToken: string | null;
  enabled: boolean;
}): void {
  const { storeId, authToken, enabled } = options;

  useEffect(() => {
    if (!enabled || storeId == null || storeId < 1 || !authToken) return undefined;

    let cancelled = false;
    let useFullSummary = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let refreshTimer: ReturnType<typeof setInterval> | null = null;
    let channel: RealtimeChannel | null = null;
    const supabase = getSupabaseAuth();

    const apply = (isFrozen: boolean, freezeReason: string | null) => {
      if (cancelled) return;
      const prev = getMerchantWalletFreezeSnapshot(storeId);
      applyFreeze(storeId, isFrozen, freezeReason);
      if (!prev || prev.isFrozen !== isFrozen) {
        requestMerchantDashboardStatsRefresh();
      }
    };

    let pollInFlight = false;

    const pollOnce = async () => {
      if (cancelled || AppState.currentState !== "active" || pollInFlight) return;
      pollInFlight = true;
      try {
        if (!useFullSummary) {
          const freeze = await fetchWalletFreezeStatus(storeId, authToken);
          apply(freeze.isFrozen, freeze.freezeReason);
          return;
        }
        const wallet = await fetchWalletSummary(storeId, authToken);
        apply(
          Boolean(wallet.isFrozen || String(wallet.status ?? "").toUpperCase() === "FROZEN"),
          wallet.freezeReason ?? null,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (!useFullSummary && /404/.test(msg)) useFullSummary = true;
      } finally {
        pollInFlight = false;
      }
    };

    const startPoll = () => {
      if (pollTimer) return;
      void pollOnce();
      pollTimer = setInterval(() => {
        void pollOnce();
      }, POLL_MS);
    };

    const stopPoll = () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    const onAppState = (next: AppStateStatus) => {
      if (next === "active") startPoll();
      else stopPoll();
    };

    const appSub = AppState.addEventListener("change", onAppState);
    startPoll();

    const unsubPush = registerMerchantForegroundPushHandler((payload) => {
      const data = payload.data ?? {};
      const code = String(data.template_code ?? data.gmType ?? data.type ?? "").toUpperCase();
      if (!code.includes("WALLET")) return;
      if (code.includes("UNFROZEN")) {
        apply(false, null);
        return;
      }
      if (code.includes("FROZEN")) {
        const reason =
          typeof data.reason === "string" && data.reason.trim()
            ? data.reason.trim()
            : typeof payload.body === "string"
              ? payload.body
              : null;
        apply(true, reason);
      }
    });

    const subscribeRealtime = () => {
      if (cancelled || !supabase || channel) return;
      channel = supabase
        .channel(merchantWalletFreezeChannel(storeId))
        .on("broadcast", { event: MERCHANT_WALLET_FREEZE_EVENT }, (msg) => {
          const parsed = freezeStateFromUnknown(msg?.payload);
          if (parsed) apply(parsed.isFrozen, parsed.freezeReason);
        })
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "merchant_wallet",
            filter: `merchant_store_id=eq.${storeId}`,
          },
          (payload) => {
            const parsed = freezeStateFromUnknown(payload.new ?? payload.old);
            if (parsed) apply(parsed.isFrozen, parsed.freezeReason);
            else void pollOnce();
          },
        )
        .subscribe();
    };

    void (async () => {
      if (supabase && authToken) {
        try {
          const rt = await fetchRealtimeAuthToken(authToken);
          if (cancelled) return;
          supabase.realtime.setAuth(rt.token);
          const refreshMs = Math.max(60_000, (rt.expiresIn - 300) * 1000);
          refreshTimer = setInterval(() => {
            void (async () => {
              try {
                const next = await fetchRealtimeAuthToken(authToken);
                if (!cancelled) supabase.realtime.setAuth(next.token);
              } catch {
                /* keep last token */
              }
            })();
          }, refreshMs);
        } catch {
          /* subscribe anyway — broadcast does not need RLS */
        }
      }
      if (!cancelled) subscribeRealtime();
    })();

    return () => {
      cancelled = true;
      appSub.remove();
      unsubPush();
      stopPoll();
      if (refreshTimer) clearInterval(refreshTimer);
      if (channel && supabase) {
        void supabase.removeChannel(channel);
        channel = null;
      }
    };
  }, [enabled, storeId, authToken]);
}
