import { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import type { OrderRecord, LineItem } from "@/hooks/useOrders";
import { useOrderSpeech } from "@/hooks/useOrderSpeech";
import { MarkAsReadyCountdownButton } from "@/components/order/MarkAsReadyCountdownButton";
import { MerchantOrderCardLayout } from "@/components/order/MerchantOrderCardLayout";
import { MerchantOrderActionsSheet } from "@/components/order/MerchantOrderActionsSheet";
import { OrderCustomerBottomSheet } from "@/components/order/OrderCustomerBottomSheet";
import { OrderTimelineSheet } from "@/components/order/OrderTimelineSheet";
import {
  isPrepCountdownExpired,
  PLATFORM_DEFAULT_PREP_MINUTES,
  prepReadyCountdownLabel,
  canUseNeedMoreTime,
  type PrepCountdownOrder,
} from "@/lib/order-prep-time";
import { OrderPrepDelayedBanner } from "@/components/order/OrderPrepDelayedBanner";
import {
  formatOrderDateTime,
} from "@/components/order/orderFormatters";

export function orderToPrepCountdown(order: OrderRecord): PrepCountdownOrder {
  return {
    created_at: order.createdAt,
    accepted_at: order.acceptedAt ?? null,
    preparing_at: order.preparingAt ?? null,
    preparation_time_minutes:
      order.preparationTimeMinutes ?? PLATFORM_DEFAULT_PREP_MINUTES,
    prep_ready_by_at: order.prepReadyByAt ?? null,
    prep_delay_minutes: order.prepDelayMinutes ?? null,
  };
}

type Props = {
  order: OrderRecord;
  storeName?: string | null;
  nowMs: number;
  onReady: () => void;
  onNeedMoreTime?: () => void;
  onViewDetail: () => void;
  onItemPress?: (item: LineItem) => void;
  loading?: boolean;
};

export function MerchantPreparingOrderCard({
  order,
  storeName,
  nowMs,
  onReady,
  onNeedMoreTime,
  onViewDetail,
  onItemPress,
  loading,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const { speaking, speak } = useOrderSpeech();

  const prepOrder = useMemo(() => orderToPrepCountdown(order), [order]);
  const placedAt = formatOrderDateTime(order.createdAt);

  const prepExpired =
    isPrepCountdownExpired(prepOrder, nowMs, { prefix: "Order Ready" }) ||
    !prepReadyCountdownLabel(prepOrder, nowMs, { prefix: "Order Ready" }).label.includes("(");

  const canNeedMore =
    prepExpired &&
    !!onNeedMoreTime &&
    canUseNeedMoreTime(
      order.prepDelayUseCount,
      Boolean(order.isBulkOrder),
      order.prepDelayMinutes
    );

  const footerButtons = prepExpired ? (
    canNeedMore ? (
      <View style={styles.actionRow}>
        <Pressable
          onPress={onNeedMoreTime}
          disabled={loading}
          style={({ pressed }) => [
            styles.needMoreBtn,
            loading && styles.btnDisabled,
            pressed && !loading && styles.pressed,
          ]}
        >
          <Text style={styles.needMoreText}>Need more time</Text>
        </Pressable>
        <View style={styles.readyBtnWrap}>
          <MarkAsReadyCountdownButton
            order={prepOrder}
            nowMs={nowMs}
            onPress={onReady}
            disabled={loading}
            labelPrefix="Order Ready"
            theme="dark"
            fullWidth
          />
        </View>
      </View>
    ) : (
      <MarkAsReadyCountdownButton
        order={prepOrder}
        nowMs={nowMs}
        onPress={onReady}
        disabled={loading}
        labelPrefix="Order Ready"
        theme="dark"
      />
    )
  ) : (
    <MarkAsReadyCountdownButton
      order={prepOrder}
      nowMs={nowMs}
      onPress={onReady}
      disabled={loading}
      labelPrefix="Order Ready"
      theme="dark"
    />
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
          prepExpired ? (
            <OrderPrepDelayedBanner order={prepOrder} nowMs={nowMs} />
          ) : undefined
        }
        footer={footerButtons}
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
  actionRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "stretch",
  },
  needMoreBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#2563EB",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  needMoreText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2563EB",
    textAlign: "center",
  },
  readyBtnWrap: {
    flex: 1,
    minWidth: 0,
  },
  btnDisabled: { opacity: 0.5 },
  pressed: { opacity: 0.88 },
});
