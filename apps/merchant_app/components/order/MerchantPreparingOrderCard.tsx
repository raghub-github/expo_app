import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Animated } from "react-native";
import { Ionicons } from "@expo/vector-icons";
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
import {
  formatOrderDateTime,
} from "@/components/order/orderFormatters";

const BLOOD_RED = "#8B0000";
const ACTIONS_HOLD_MS = 5000;
const DELAYED_FLASH_MS = 800;
const FADE_OUT_MS = 120;
const FADE_IN_MS = 200;

export function orderToPrepCountdown(order: OrderRecord): PrepCountdownOrder {
  return {
    created_at: order.createdAt,
    accepted_at: order.acceptedAt ?? null,
    preparing_at: order.preparingAt ?? null,
    preparation_time_minutes:
      order.preparationTimeMinutes ?? PLATFORM_DEFAULT_PREP_MINUTES,
    prep_ready_by_at: order.prepReadyByAt ?? null,
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
  const [showActions, setShowActions] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const delayedOpacity = useRef(new Animated.Value(0)).current;
  const actionsOpacity = useRef(new Animated.Value(1)).current;
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

  useEffect(() => {
    if (!prepExpired) {
      setShowActions(true);
      delayedOpacity.setValue(0);
      actionsOpacity.setValue(1);
      return;
    }

    let cancelled = false;
    const timeouts: ReturnType<typeof setTimeout>[] = [];

    const schedule = (fn: () => void, ms: number) => {
      const id = setTimeout(fn, ms);
      timeouts.push(id);
    };

    const fadeToDelayed = () => {
      if (cancelled) return;
      setShowActions(false);
      Animated.parallel([
        Animated.timing(actionsOpacity, {
          toValue: 0,
          duration: FADE_OUT_MS,
          useNativeDriver: true,
        }),
        Animated.timing(delayedOpacity, {
          toValue: 1,
          duration: FADE_IN_MS,
          useNativeDriver: true,
        }),
      ]).start();
    };

    const fadeToActions = (onDone?: () => void) => {
      if (cancelled) return;
      setShowActions(true);
      Animated.parallel([
        Animated.timing(delayedOpacity, {
          toValue: 0,
          duration: FADE_OUT_MS,
          useNativeDriver: true,
        }),
        Animated.timing(actionsOpacity, {
          toValue: 1,
          duration: FADE_IN_MS,
          useNativeDriver: true,
        }),
      ]).start(() => {
        if (!cancelled) onDone?.();
      });
    };

    const runCycle = () => {
      if (cancelled) return;
      delayedOpacity.setValue(0);
      actionsOpacity.setValue(1);
      setShowActions(true);

      schedule(() => {
        fadeToDelayed();
        schedule(() => {
          fadeToActions(runCycle);
        }, DELAYED_FLASH_MS);
      }, ACTIONS_HOLD_MS);
    };

    runCycle();

    return () => {
      cancelled = true;
      timeouts.forEach(clearTimeout);
    };
  }, [prepExpired, delayedOpacity, actionsOpacity]);

  const footerButtons = prepExpired ? (
    <View style={styles.bottomAnimWrap}>
      <Animated.View
        style={[styles.bottomLayer, { opacity: delayedOpacity }]}
        pointerEvents={showActions ? "none" : "auto"}
      >
        <View style={styles.delayedBtn}>
          <Text style={styles.delayedBtnText}>Delayed</Text>
        </View>
      </Animated.View>

      <Animated.View
        style={[styles.bottomLayer, { opacity: actionsOpacity }]}
        pointerEvents={showActions ? "auto" : "none"}
      >
        {canNeedMore ? (
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
        )}
      </Animated.View>
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
            <View style={styles.delayedBanner}>
              <Ionicons name="hourglass-outline" size={14} color="#FFFFFF" />
              <Text style={styles.delayedBannerText}>DELAYED</Text>
            </View>
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
  delayedBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: BLOOD_RED,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  delayedBannerText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  bottomAnimWrap: {
    position: "relative",
    minHeight: 48,
  },
  bottomLayer: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
  },
  delayedBtn: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: BLOOD_RED,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  delayedBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
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
