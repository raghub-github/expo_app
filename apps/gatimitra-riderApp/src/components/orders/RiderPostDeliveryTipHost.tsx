import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { riderApi } from "@/src/services/api/riderApi";
import { useSessionStore } from "@/src/stores/sessionStore";
import { RiderTipEarnedBottomSheet } from "@/src/components/orders/RiderTipEarnedBottomSheet";
import { isRiderTipLedgerCredit } from "@/src/lib/rider-ledger-tip";
import {
  findRiderOrderInQueryCache,
  RIDER_ORDER_DETAIL_QUERY_KEY,
} from "@/src/hooks/useOrders";
import {
  getOrderTipBaseline,
  hasRecentOrderTipBaseline,
  loadCelebratedTipLedgerIds,
  markTipLedgerEntryCelebrated,
  recordOrderTipBaseline,
  subscribeTipBaselineRecorded,
} from "@/src/lib/rider-tip-celebration-storage";

const LEDGER_POLL_MS = 12_000;
const TIP_WATCH_WINDOW_MS = 2 * 60 * 60 * 1000;
const MAX_TIP_ENTRY_AGE_MS = 48 * 60 * 60 * 1000;

type TipSheetContext = {
  orderIdLabel: string;
  customerName: string;
};

function resolveOrderIdForTipEntry(entry: {
  orderPublicId: string | null;
  description: string;
  ref: string | null;
}): string | null {
  const publicId = entry.orderPublicId?.trim();
  if (publicId) return publicId;
  const fromDesc = entry.description.match(/Order\s+#?\s*(\S+)/i)?.[1]?.trim();
  return fromDesc || null;
}

async function resolveTipSheetContext(
  orderRef: string,
  queryClient: ReturnType<typeof useQueryClient>
): Promise<TipSheetContext> {
  const cached = findRiderOrderInQueryCache(queryClient, orderRef);
  if (cached) {
    return {
      orderIdLabel: cached.formattedOrderId?.trim() || cached.id || orderRef,
      customerName: cached.customerName?.trim() || "",
    };
  }

  try {
    const order = await riderApi.getRideOrder(orderRef);
    queryClient.setQueryData(RIDER_ORDER_DETAIL_QUERY_KEY(orderRef), order);
    return {
      orderIdLabel: order.formattedOrderId?.trim() || order.id || orderRef,
      customerName: order.customerName?.trim() || "",
    };
  } catch {
    return {
      orderIdLabel: orderRef,
      customerName: "",
    };
  }
}

export function RiderPostDeliveryTipHost() {
  const session = useSessionStore((s) => s.session);
  const queryClient = useQueryClient();
  const [visible, setVisible] = useState(false);
  const [tipAmount, setTipAmount] = useState(0);
  const [sheetContext, setSheetContext] = useState<TipSheetContext | null>(null);
  const [celebratedReady, setCelebratedReady] = useState(false);
  const celebratedIdsRef = useRef<Set<number>>(new Set());
  const celebratedLoadedRef = useRef(false);
  const pendingEntryIdRef = useRef<number | null>(null);
  const pendingOrderIdRef = useRef<string | null>(null);
  const pendingCreditedTipRef = useRef(0);
  const evaluatingRef = useRef(false);
  const [appActive, setAppActive] = useState(
    () => AppState.currentState === "active"
  );
  const [watchTips, setWatchTips] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const refreshWatch = () => {
      void hasRecentOrderTipBaseline(TIP_WATCH_WINDOW_MS).then((watch) => {
        if (!cancelled) setWatchTips(watch);
      });
    };
    refreshWatch();
    const unsub = subscribeTipBaselineRecorded(refreshWatch);
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadCelebratedTipLedgerIds().then((ids) => {
      if (cancelled) return;
      celebratedIdsRef.current = ids;
      celebratedLoadedRef.current = true;
      setCelebratedReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      setAppActive(state === "active");
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, []);

  const { data: ledger } = useQuery({
    queryKey: ["rider", "tip-celebration-ledger"],
    queryFn: () =>
      riderApi.getLedger({
        segment: "all",
        period: "this_month",
        limit: 40,
      }),
    enabled: Boolean(session?.accessToken) && appActive && watchTips,
    refetchInterval: watchTips ? LEDGER_POLL_MS : false,
    refetchIntervalInBackground: false,
    staleTime: 10_000,
  });

  const evaluateLedger = useCallback(async () => {
    if (!ledger?.entries?.length || evaluatingRef.current || visible || !celebratedReady) return;

    evaluatingRef.current = true;
    try {
      for (const entry of ledger.entries) {
        if (!isRiderTipLedgerCredit(entry)) continue;
        if (celebratedIdsRef.current.has(entry.id)) continue;

        const createdAt = Date.parse(entry.createdAt);
        if (Number.isFinite(createdAt) && Date.now() - createdAt > MAX_TIP_ENTRY_AGE_MS) {
          celebratedIdsRef.current.add(entry.id);
          await markTipLedgerEntryCelebrated(entry.id);
          continue;
        }

        const orderId = resolveOrderIdForTipEntry(entry);
        const baseline = orderId ? await getOrderTipBaseline(orderId) : 0;
        const creditedTip = Math.round(Number(entry.amount) || 0);
        const postDeliveryTip = creditedTip - baseline;

        if (postDeliveryTip <= 0) {
          celebratedIdsRef.current.add(entry.id);
          await markTipLedgerEntryCelebrated(entry.id);
          continue;
        }

        const context = orderId
          ? await resolveTipSheetContext(orderId, queryClient)
          : { orderIdLabel: "", customerName: "" };

        pendingEntryIdRef.current = entry.id;
        pendingOrderIdRef.current = orderId;
        pendingCreditedTipRef.current = creditedTip;
        setSheetContext(context);
        setTipAmount(postDeliveryTip);
        setVisible(true);
        return;
      }
    } finally {
      evaluatingRef.current = false;
    }
  }, [ledger, queryClient, visible, celebratedReady]);

  useEffect(() => {
    void evaluateLedger();
  }, [evaluateLedger]);

  const dismiss = useCallback(() => {
    const entryId = pendingEntryIdRef.current;
    const orderId = pendingOrderIdRef.current;
    const creditedTip = pendingCreditedTipRef.current;
    const orderLabel = sheetContext?.orderIdLabel ?? null;

    if (entryId != null) {
      celebratedIdsRef.current.add(entryId);
    }

    pendingEntryIdRef.current = null;
    pendingOrderIdRef.current = null;
    pendingCreditedTipRef.current = 0;
    setVisible(false);
    setTipAmount(0);
    setSheetContext(null);

    void (async () => {
      if (entryId != null) {
        await markTipLedgerEntryCelebrated(entryId);
      }
      if (orderId && creditedTip > 0) {
        await recordOrderTipBaseline(orderId, creditedTip, orderLabel ? [orderLabel] : []);
      }
    })();
  }, [sheetContext?.orderIdLabel]);

  if (!session?.accessToken) return null;

  return (
    <RiderTipEarnedBottomSheet
      visible={visible}
      tipAmount={tipAmount}
      orderIdLabel={sheetContext?.orderIdLabel}
      customerName={sheetContext?.customerName}
      onDismiss={dismiss}
    />
  );
}
