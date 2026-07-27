import { useEffect, useMemo, useState } from "react";
import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet, ScrollView, Dimensions } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { GatiMitraMerchant, H_PADDING } from "@/constants/theme";
import type { OrderRecord } from "@/hooks/useOrders";
import type { MerchantOrderActionForTimeline } from "@/services/ordersApi";
import { orderRecordToTimelineOrder } from "@/lib/merchantVisibleTimeline";
import {
  fetchOrderTimelineCached,
  getCachedOrderTimeline,
  prefetchOrderTimeline,
} from "@/lib/orderTimelineCache";
import {
  fetchMerchantTimelineEnrichmentCached,
  getCachedMerchantTimelineEnrichment,
  prefetchMerchantTimelineEnrichment,
} from "@/lib/merchantTimelineEnrichmentCache";
import { MerchantOrderVerticalTimeline } from "@/components/order/MerchantOrderVerticalTimeline";
import { MerchantBottomSheetShell } from "@/components/order/MerchantBottomSheetShell";
import { MerchantOrderIdRow } from "@/components/order/MerchantOrderCardToolbar";

const SHEET_MIN_HEIGHT = Math.round(Dimensions.get("window").height * 0.55);

type Props = {
  visible: boolean;
  order: OrderRecord | null;
  onClose: () => void;
};

function resolveFoodId(order: OrderRecord | null): number | null {
  if (!order || order.id.startsWith("core-")) return null;
  const foodId = parseInt(order.id, 10);
  return Number.isFinite(foodId) ? foodId : null;
}

function formatDeliverySummary(order: OrderRecord): string | null {
  const created = new Date(order.createdAt).getTime();
  const deliveredRaw = order.deliveredAt;
  if (!deliveredRaw) return null;
  const delivered = new Date(deliveredRaw).getTime();
  if (!Number.isFinite(created) || !Number.isFinite(delivered) || delivered <= created) return null;
  const mins = Math.max(1, Math.round((delivered - created) / 60000));
  return `Delivered in ${mins} minute${mins === 1 ? "" : "s"}`;
}

export function OrderTimelineSheet({ visible, order, onClose }: Props) {
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id ?? null;

  const foodId = resolveFoodId(order);
  const timelineOrder = useMemo(
    () => (order ? orderRecordToTimelineOrder(order) : null),
    [order]
  );
  const deliverySummary = useMemo(
    () => (order ? formatDeliverySummary(order) : null),
    [order]
  );

  const cachedTimelineEntries =
    foodId != null && storeId
      ? (getCachedOrderTimeline(storeId, foodId)?.map((e) => ({
          status: e.status,
          occurred_at: e.occurred_at,
          status_message: e.status_message,
        })) ?? [])
      : [];

  const [timelineEntries, setTimelineEntries] = useState<
    Array<{ status: string; occurred_at: string; status_message?: string | null }>
  >(() => cachedTimelineEntries);
  const [actions, setActions] = useState<MerchantOrderActionForTimeline[]>([]);
  const [riderReachedAt, setRiderReachedAt] = useState<string | null>(null);

  useEffect(() => {
    if (foodId == null || !storeId || !token) return;
    prefetchOrderTimeline(storeId, foodId, token);
    prefetchMerchantTimelineEnrichment(storeId, foodId, token);
  }, [foodId, storeId, token]);

  useEffect(() => {
    if (!visible || foodId == null || !storeId || !token) {
      if (!visible) setTimelineEntries([]);
      return;
    }

    const cached = getCachedOrderTimeline(storeId, foodId);
    if (cached !== undefined) {
      setTimelineEntries(
        cached.map((e) => ({
          status: e.status,
          occurred_at: e.occurred_at,
          status_message: e.status_message,
        }))
      );
    }

    let cancelled = false;
    void fetchOrderTimelineCached(storeId, foodId, token).then((list) => {
      if (cancelled) return;
      setTimelineEntries(
        list.map((e) => ({
          status: e.status,
          occurred_at: e.occurred_at,
          status_message: e.status_message,
        }))
      );
    });

    return () => {
      cancelled = true;
    };
  }, [visible, foodId, storeId, token]);

  const cachedEnrichment =
    visible && foodId != null && storeId
      ? getCachedMerchantTimelineEnrichment(storeId, foodId)
      : undefined;

  const effectiveRiderReachedAt = riderReachedAt ?? cachedEnrichment?.riderReachedAt ?? null;
  const effectiveActions = actions.length > 0 ? actions : (cachedEnrichment?.actions ?? []);

  useEffect(() => {
    if (!visible || foodId == null || !storeId || !token) {
      if (!visible) {
        setRiderReachedAt(null);
        setActions([]);
      }
      return;
    }

    const cached = getCachedMerchantTimelineEnrichment(storeId, foodId);
    if (cached) {
      setRiderReachedAt(cached.riderReachedAt);
      setActions(cached.actions);
    }

    let cancelled = false;
    void fetchMerchantTimelineEnrichmentCached(storeId, foodId, token).then((enrichment) => {
      if (cancelled) return;
      setRiderReachedAt(enrichment.riderReachedAt);
      setActions(enrichment.actions);
    });

    return () => {
      cancelled = true;
    };
  }, [visible, foodId, storeId, token]);

  if (!order) return null;

  return (
    <MerchantBottomSheetShell visible={visible} onClose={onClose} maxHeightPercent="88%">
      <View style={[styles.body, { minHeight: SHEET_MIN_HEIGHT }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Order timeline</Text>
        </View>

        <View style={styles.metaBlock}>
          <MerchantOrderIdRow
            formattedOrderId={order.formattedOrderId}
            fallbackOrderId={order.ordersCoreId}
          />
          {deliverySummary ? (
            <Text style={styles.deliverySummary}>{deliverySummary}</Text>
          ) : null}
        </View>

        <View style={styles.divider} />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {timelineOrder ? (
            <MerchantOrderVerticalTimeline
              order={timelineOrder}
              timelineEntries={
                timelineEntries.length > 0 ? timelineEntries : cachedTimelineEntries
              }
              actions={effectiveActions}
              riderReachedAt={effectiveRiderReachedAt}
            />
          ) : (
            <Text style={styles.empty}>Timeline unavailable for this order.</Text>
          )}
        </ScrollView>
      </View>
    </MerchantBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  body: {
    flexGrow: 1,
    backgroundColor: "#FFFFFF",
  },
  header: {
    paddingTop: 16,
    paddingHorizontal: H_PADDING,
    paddingBottom: 12,
    alignItems: "center",
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  metaBlock: {
    paddingHorizontal: H_PADDING,
    paddingBottom: 14,
    gap: 4,
  },
  orderId: {
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  deliverySummary: {
    fontSize: 13,
    color: GatiMitraMerchant.textSecondary,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: GatiMitraMerchant.divider,
    marginHorizontal: H_PADDING,
  },
  scroll: {
    flexGrow: 1,
  },
  scrollContent: {
    paddingHorizontal: H_PADDING,
    paddingTop: 16,
    paddingBottom: 28,
  },
  empty: {
    paddingVertical: 32,
    textAlign: "center",
    color: GatiMitraMerchant.textTertiary,
    fontSize: 14,
  },
});
