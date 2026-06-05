import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { OrderRecord, LineItem } from "@/hooks/useOrders";
import { MerchantOrderCardLayout } from "@/components/order/MerchantOrderCardLayout";
import { MerchantOrderActionsSheet } from "@/components/order/MerchantOrderActionsSheet";
import { OrderCustomerBottomSheet } from "@/components/order/OrderCustomerBottomSheet";
import { OrderTimelineSheet } from "@/components/order/OrderTimelineSheet";
import {
  formatOrderDateTime,
} from "@/components/order/orderFormatters";
import { useOrderSpeech } from "@/hooks/useOrderSpeech";
import { callRider } from "@/lib/orderCardActions";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { resolvePreparedLateMinutes } from "@/lib/order-prep-time";
import { OrderPreparedLateTopBanner } from "@/components/order/OrderPrepDelayedBanner";
import { merchantOrderCardLayoutStyles as layoutStyles } from "@/components/order/merchantOrderCardLayoutStyles";
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

function riderFirstName(name: string | null | undefined): string {
  const n = (name ?? "").trim();
  if (!n) return "Delivery partner";
  return n.split(/\s+/)[0] ?? n;
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
  const [rider, setRider] = useState<FoodOrderRiderLogEntry | null>(null);
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

  const riderLine = useMemo(() => {
    const first = riderFirstName(rider?.rider_name);
    return `${first} is out for delivery`;
  }, [rider?.rider_name]);

  useEffect(() => {
    if (!token || !storeId || order.id.startsWith("core-")) return;
    const foodId = parseInt(order.id, 10);
    if (!Number.isFinite(foodId)) return;
    let cancelled = false;
    void fetchFoodOrderRidersLog(storeId, foodId, token).then((rows) => {
      if (!cancelled) setRider(pickActiveRider(rows));
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
        order={order}
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
        riderContent={
          <View style={layoutStyles.riderRow}>
            {rider?.selfie_url ? (
              <Image source={{ uri: rider.selfie_url }} style={styles.riderAvatarImg} />
            ) : (
              <View style={styles.riderAvatar}>
                <Ionicons name="person" size={18} color="#888888" />
              </View>
            )}
            <Text style={layoutStyles.riderText} numberOfLines={2}>
              {riderLine}
            </Text>
            <Pressable
              onPress={() => void callRider(rider?.rider_mobile)}
              style={({ pressed }) => [styles.callBtn, pressed && layoutStyles.pressed]}
              hitSlop={8}
            >
              <Ionicons name="call" size={18} color="#1A1A1A" />
            </Pressable>
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
  riderAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#E8E8E8",
    alignItems: "center",
    justifyContent: "center",
  },
  riderAvatarImg: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#E8E8E8",
  },
  callBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F0F0F0",
    alignItems: "center",
    justifyContent: "center",
  },
});
