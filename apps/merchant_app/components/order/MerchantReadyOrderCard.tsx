import { useMemo, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { OrderRecord, LineItem } from "@/hooks/useOrders";
import { useOrderSpeech } from "@/hooks/useOrderSpeech";
import { ReadyHandoverTimeline } from "@/components/order/ReadyHandoverTimeline";
import { MerchantOrderCardLayout } from "@/components/order/MerchantOrderCardLayout";
import { MerchantOrderActionsSheet } from "@/components/order/MerchantOrderActionsSheet";
import { OrderCustomerBottomSheet } from "@/components/order/OrderCustomerBottomSheet";
import { OrderTimelineSheet } from "@/components/order/OrderTimelineSheet";
import { formatOrderDateTime } from "@/components/order/orderFormatters";
import { resolvePreparedAtForHandover } from "@/lib/orderHandoverTimeline";
import { resolvePreparedLateMinutes } from "@/lib/order-prep-time";
import { OrderPreparedLateTopBanner } from "@/components/order/OrderPrepDelayedBanner";
import { merchantOrderCardLayoutStyles as layoutStyles } from "@/components/order/merchantOrderCardLayoutStyles";

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

  const placedAt = formatOrderDateTime(order.createdAt);

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
        onMenu={() => setMenuOpen(true)}
        outerBanner={
          preparedLateMins != null && preparedLateMins > 0 ? (
            <OrderPreparedLateTopBanner lateMinutes={preparedLateMins} />
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
          <View style={layoutStyles.riderRow}>
            <View style={layoutStyles.riderAvatar}>
              <Ionicons name="bicycle" size={16} color="#888888" />
            </View>
            <Text style={layoutStyles.riderText}>Rider is arriving soon</Text>
          </View>
        }
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

const styles = StyleSheet.create({
  timelineWrap: { paddingHorizontal: 14, paddingVertical: 8 },
});
