import { useCallback, useEffect, useMemo, useState } from "react";
import type { OrderRecord, LineItem } from "@/hooks/useOrders";
import { MerchantOrderCardLayout } from "@/components/order/MerchantOrderCardLayout";
import { MerchantOrderActionsSheet } from "@/components/order/MerchantOrderActionsSheet";
import { OrderCustomerBottomSheet } from "@/components/order/OrderCustomerBottomSheet";
import { OrderTimelineSheet } from "@/components/order/OrderTimelineSheet";
import { formatOrderDateTime } from "@/components/order/orderFormatters";
import { useOrderSpeech } from "@/hooks/useOrderSpeech";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { resolvePreparedLateMinutes } from "@/lib/order-prep-time";
import { OrderPreparedLateTopBanner } from "@/components/order/OrderPrepDelayedBanner";
import { MerchantAssignedRiderRow } from "@/components/order/MerchantAssignedRiderRow";
import {
  fetchFoodOrderRidersLog,
  type FoodOrderRiderLogEntry,
} from "@/services/ordersApi";

type Props = {
  order: OrderRecord;
  storeName?: string | null;
  onViewDetail?: () => void;
  onItemPress?: (item: LineItem) => void;
};

function pickActiveRider(riders: FoodOrderRiderLogEntry[]): FoodOrderRiderLogEntry | null {
  if (!riders.length) return null;
  const picked = riders.find((r) => r.picked_up_at && !r.delivered_at && !r.cancelled_at);
  if (picked) return picked;
  const accepted = riders.find(
    (r) =>
      r.assignment_status === "ACTIVE" ||
      r.assignment_status === "ACCEPTED" ||
      r.assignment_status === "PICKED_UP"
  );
  return accepted ?? riders[0];
}

function mergeRiderIntoOrder(
  order: OrderRecord,
  rider: FoodOrderRiderLogEntry | null
): OrderRecord {
  if (!rider) return order;
  return {
    ...order,
    riderId: rider.rider_id || order.riderId,
    riderName: rider.rider_name ?? order.riderName,
    riderMobile: rider.rider_mobile ?? order.riderMobile,
    riderSelfieUrl: rider.selfie_url ?? order.riderSelfieUrl,
    riderAssignmentStatus: rider.assignment_status ?? order.riderAssignmentStatus,
    riderReachedAt: rider.reached_merchant_at ?? order.riderReachedAt,
  };
}

export function MerchantOutForDeliveryOrderCard({
  order,
  storeName,
  onViewDetail,
  onItemPress,
}: Props) {
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id ?? null;

  const [menuOpen, setMenuOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [fetchedRider, setFetchedRider] = useState<FoodOrderRiderLogEntry | null>(null);
  const { speaking, speak } = useOrderSpeech();

  const placedAt = formatOrderDateTime(order.createdAt);
  const displayOrder = useMemo(
    () => mergeRiderIntoOrder(order, fetchedRider),
    [order, fetchedRider]
  );

  const preparedLateMins = useMemo(
    () =>
      resolvePreparedLateMinutes({
        prepared_late_minutes: order.preparedLateMinutes,
        prepared_at: order.preparedAt,
        prep_ready_by_at: order.prepReadyByAt,
      }),
    [order.preparedLateMinutes, order.preparedAt, order.prepReadyByAt]
  );

  useEffect(() => {
    if (!token || !storeId || order.id.startsWith("core-")) return;
    const foodId = parseInt(order.id, 10);
    if (!Number.isFinite(foodId)) return;
    let cancelled = false;
    void fetchFoodOrderRidersLog(storeId, foodId, token).then((rows) => {
      if (!cancelled) setFetchedRider(pickActiveRider(rows));
    });
    return () => {
      cancelled = true;
    };
  }, [token, storeId, order.id]);

  const openDetail = useCallback(() => {
    onViewDetail?.();
  }, [onViewDetail]);

  return (
    <>
      <MerchantOrderCardLayout
        order={displayOrder}
        storeName={storeName}
        placedAt={placedAt}
        onViewDetail={openDetail}
        onItemPress={onItemPress}
        onCustomerPress={() => setCustomerOpen(true)}
        speakingActive={speaking}
        onSpeak={() => void speak(order)}
        onMenu={() => setMenuOpen(true)}
        outerBanner={
          preparedLateMins != null && preparedLateMins > 0 ? (
            <OrderPreparedLateTopBanner lateMinutes={preparedLateMins} />
          ) : undefined
        }
        riderContent={<MerchantAssignedRiderRow order={displayOrder} />}
      />

      <MerchantOrderActionsSheet
        visible={menuOpen}
        order={order}
        storeName={storeName}
        onClose={() => setMenuOpen(false)}
        onOpenTimeline={() => setTimelineOpen(true)}
        onOpenCustomer={() => setCustomerOpen(true)}
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
