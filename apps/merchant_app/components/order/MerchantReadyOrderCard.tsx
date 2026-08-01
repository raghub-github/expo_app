import { useMemo, useState } from "react";
import { View, StyleSheet } from "react-native";
import type { OrderRecord, LineItem } from "@/hooks/useOrders";
import { useOrderSpeech } from "@/hooks/useOrderSpeech";
import { useMerchantPrintContext } from "@/hooks/useMerchantPrintContext";
import { printOrderKot } from "@/lib/orderCardActions";
import { ReadyHandoverTimeline } from "@/components/order/ReadyHandoverTimeline";
import { MerchantOrderCardLayout } from "@/components/order/MerchantOrderCardLayout";
import { MerchantOrderActionsSheet } from "@/components/order/MerchantOrderActionsSheet";
import { OrderCustomerBottomSheet } from "@/components/order/OrderCustomerBottomSheet";
import { OrderTimelineSheet } from "@/components/order/OrderTimelineSheet";
import { formatOrderDateTime } from "@/components/order/orderFormatters";
import { resolvePreparedAtForHandover } from "@/lib/orderHandoverTimeline";
import { resolvePreparedLateMinutes } from "@/lib/order-prep-time";
import { OrderPreparedLateTopBanner } from "@/components/order/OrderPrepDelayedBanner";
import { OrderPriorityBanner } from "@/components/order/OrderPriorityBanner";
import { orderShowsRiderPriority } from "@/lib/orderRiderPriority";
import { RiderAssignPendingCard } from "@/components/order/RiderAssignPendingCard";
import { MerchantAssignedRiderRow } from "@/components/order/MerchantAssignedRiderRow";
import { useNearbyDispatchRiders } from "@/hooks/useNearbyDispatchRiders";
import { shouldShowPendingRiderAssign } from "@/lib/orderAssignedRider";

function parseOrdersFoodId(orderId: string): number | null {
  const n = parseInt(orderId, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

type Props = {
  order: OrderRecord;
  storeName?: string | null;
  nowMs: number;
  onViewDetail?: () => void;
  onItemPress?: (item: LineItem) => void;
};

export function MerchantReadyOrderCard({
  order,
  storeName,
  nowMs,
  onViewDetail,
  onItemPress,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const { speaking, speak } = useOrderSpeech();
  const printContext = useMerchantPrintContext();

  const placedAt = formatOrderDateTime(order.createdAt);

  const ordersFoodId = parseOrdersFoodId(order.id);
  const showPendingRider = shouldShowPendingRiderAssign(order, ["ready"]);
  const { summary: nearbyRiderSummary } = useNearbyDispatchRiders(ordersFoodId, showPendingRider);

  const preparedLateMins = useMemo(
    () =>
      resolvePreparedLateMinutes({
        prepared_late_minutes: order.preparedLateMinutes,
        prepared_at: order.preparedAt,
        prep_ready_by_at: order.prepReadyByAt,
      }),
    [order.preparedLateMinutes, order.preparedAt, order.prepReadyByAt]
  );

  const preparedAtForTimeline = useMemo(
    () =>
      resolvePreparedAtForHandover(order.preparedAt, {
        isReady: order.status === "ready" || order.pipelineStatus === "READY_FOR_PICKUP",
        preparingAt: order.preparingAt,
        acceptedAt: order.acceptedAt,
        createdAt: order.createdAt,
      }),
    [order]
  );

  return (
    <>
      <MerchantOrderCardLayout
        order={order}
        storeName={storeName}
        placedAt={placedAt}
        onViewDetail={onViewDetail}
        onItemPress={onItemPress}
        onCustomerPress={() => setCustomerOpen(true)}
        speakingActive={speaking}
        onSpeak={() => void speak(order)}
        onPrint={() => void printOrderKot(order, printContext)}
        onMenu={() => setMenuOpen(true)}
        outerBanner={
          orderShowsRiderPriority(order, nowMs) ||
          (preparedLateMins != null && preparedLateMins > 0) ? (
            <>
              {orderShowsRiderPriority(order, nowMs) ? <OrderPriorityBanner /> : null}
              {preparedLateMins != null && preparedLateMins > 0 ? (
                <OrderPreparedLateTopBanner lateMinutes={preparedLateMins} />
              ) : null}
            </>
          ) : undefined
        }
        midContent={
          <View style={styles.timelineWrap}>
            <ReadyHandoverTimeline
              preparedAt={preparedAtForTimeline}
              handedOverAt={order.handedOverToRiderAt}
              pickedUpAt={order.riderPickedUpAt}
              pickupOtp={order.pickupOtp}
              nowMs={nowMs}
            />
          </View>
        }
        riderContent={
          showPendingRider ? (
            <RiderAssignPendingCard summary={nearbyRiderSummary} />
          ) : order.deliveryType === "GATIMITRA_RIDER" ? (
            <MerchantAssignedRiderRow order={order} />
          ) : null
        }
      />

      <MerchantOrderActionsSheet
        visible={menuOpen}
        order={order}
        printContext={printContext}
        storeName={storeName}
        onClose={() => setMenuOpen(false)}
        onOpenTimeline={() => setTimelineOpen(true)}
        onOpenCustomer={() => setCustomerOpen(true)}
        onViewDetails={onViewDetail}
      />

      <OrderCustomerBottomSheet
        visible={customerOpen}
        order={order}
        onClose={() => setCustomerOpen(false)}
      />

      <OrderTimelineSheet
        visible={timelineOpen}
        order={order}
        onClose={() => setTimelineOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  timelineWrap: { paddingHorizontal: 14, paddingVertical: 8 },
});
