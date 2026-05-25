import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import {
  useOrders,
  type OrderRecord,
} from "@/hooks/useOrders";
import { patchFoodOrderStatus } from "@/services/ordersApi";
import {
  fetchOrderAcceptanceSettings,
  type OrderAcceptanceSettings,
} from "@/services/orderAcceptanceApi";
import {
  readDeviceOrderAlertsAsync,
  resolveAlertUrlFromSlots,
  volumeStepTo01,
} from "@/lib/deviceOrderAlerts";
import { playOrderAlertSound, stopOrderAlertSound } from "@/lib/playOrderAlertSound";
import { RejectOrderSheet } from "@/components/order/RejectOrderSheet";
import { formatOrderIdDisplay } from "@/components/order/orderFormatters";
import { GatiMitraMerchant, CARD_RADIUS, H_PADDING } from "@/constants/theme";
import type { MerchantCancellationReason } from "@/lib/merchantCancellationReasons";
import * as SecureStore from "expo-secure-store";

const DISMISS_KEY = "merchant_incoming_order_dismissed_v1";
const DEFAULT_SETTINGS: OrderAcceptanceSettings = {
  store_type: "GENERAL",
  acceptance_window_minutes: 5,
  alert_sound_enabled: true,
  alert_sound_url: null,
  alert_sound_repeat_count: 1,
  alert_sound_urls_by_slot: [null, null, null],
  alert_sound_slot_choice: 0,
};

async function getDismissed(): Promise<Set<number>> {
  try {
    const raw = await SecureStore.getItemAsync(DISMISS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as Array<{ order_id: number; t: number }>;
    const out = new Set<number>();
    const now = Date.now();
    for (const it of Array.isArray(arr) ? arr : []) {
      if (
        it &&
        typeof it.order_id === "number" &&
        typeof it.t === "number" &&
        now - it.t < 7 * 86400_000
      ) {
        out.add(it.order_id);
      }
    }
    return out;
  } catch {
    return new Set();
  }
}

async function addDismissed(orderCoreId: number) {
  const prev = await getDismissed();
  prev.add(orderCoreId);
  const arr = Array.from(prev).map((oid) => ({ order_id: oid, t: Date.now() }));
  await SecureStore.setItemAsync(DISMISS_KEY, JSON.stringify(arr.slice(-200)));
}

/**
 * Full-screen incoming order modal + alert sound (partnersite / dashboard parity).
 */
export default function IncomingOrderModal() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id ?? null;
  const { orders, refetch } = useOrders(8000);

  const [modalOrder, setModalOrder] = useState<OrderRecord | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [acceptanceSettings, setAcceptanceSettings] =
    useState<OrderAcceptanceSettings>(DEFAULT_SETTINGS);
  const [deviceAlerts, setDeviceAlerts] = useState({
    orderAlertsEnabled: true,
    soundAlertsEnabled: true,
    alertSoundSlot: 0,
    volumeStep: 5,
    ringInSilent: true,
  });

  const seenFoodIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const shownCoreIdsRef = useRef<Set<string>>(new Set());
  const autoCancelFiredRef = useRef<number | null>(null);

  const reloadSettings = useCallback(async () => {
    if (!token || !storeId) return;
    try {
      const [acc, dev] = await Promise.all([
        fetchOrderAcceptanceSettings(storeId, token),
        readDeviceOrderAlertsAsync(storeId),
      ]);
      setAcceptanceSettings(acc);
      setDeviceAlerts(dev);
    } catch {
      setAcceptanceSettings(DEFAULT_SETTINGS);
    }
  }, [token, storeId]);

  useEffect(() => {
    void reloadSettings();
  }, [reloadSettings]);

  const openIfNew = useCallback(
    async (order: OrderRecord) => {
      if (!storeId || !token) return;
      if (order.status !== "created" || order.id.startsWith("core-")) return;

      const [dev, acc] = await Promise.all([
        readDeviceOrderAlertsAsync(storeId),
        fetchOrderAcceptanceSettings(storeId, token).catch(() => acceptanceSettings),
      ]);
      setDeviceAlerts(dev);
      setAcceptanceSettings(acc);

      if (!dev.orderAlertsEnabled) return;

      const dismissed = await getDismissed();
      if (dismissed.has(order.ordersCoreId)) return;

      const dedupeKey = `c:${order.ordersCoreId}`;
      if (shownCoreIdsRef.current.has(dedupeKey)) return;
      shownCoreIdsRef.current.add(dedupeKey);

      const windowMs = Math.max(
        60_000,
        Math.max(1, Math.min(180, acceptanceSettings.acceptance_window_minutes)) * 60_000
      );
      const age = Date.now() - new Date(order.createdAt).getTime();
      if (age >= windowMs) {
        await addDismissed(order.ordersCoreId);
        return;
      }

      setModalOrder(order);

      if (dev.soundAlertsEnabled && acc.alert_sound_enabled) {
        const slots =
          acc.alert_sound_urls_by_slot ??
          ([acc.alert_sound_url, null, null] as [
            string | null,
            string | null,
            string | null,
          ]);
        const chimeUrl =
          resolveAlertUrlFromSlots(slots, dev.alertSoundSlot) ?? acc.alert_sound_url;
        void playOrderAlertSound(
          chimeUrl,
          acc.alert_sound_repeat_count,
          volumeStepTo01(dev.volumeStep)
        );
      }
    },
    [storeId, token, acceptanceSettings]
  );

  useEffect(() => {
    if (!storeId || !token) return;
    const created = orders.filter((o) => o.status === "created" && !o.id.startsWith("core-"));
    if (!initializedRef.current) {
      for (const o of created) {
        seenFoodIdsRef.current.add(o.id);
      }
      initializedRef.current = true;
      return;
    }
    if (modalOrder) return;
    for (const o of created) {
      if (seenFoodIdsRef.current.has(o.id)) continue;
      seenFoodIdsRef.current.add(o.id);
      void openIfNew(o);
      break;
    }
  }, [orders, storeId, token, modalOrder, openIfNew]);

  useEffect(() => {
    if (!modalOrder) return;
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [modalOrder]);

  const acceptWindowMs = useMemo(() => {
    const mins = Math.max(
      1,
      Math.min(180, Number(acceptanceSettings.acceptance_window_minutes || 5))
    );
    return mins * 60_000;
  }, [acceptanceSettings.acceptance_window_minutes]);

  const secondsLeft = useMemo(() => {
    if (!modalOrder) return 0;
    const deadline = new Date(modalOrder.createdAt).getTime() + acceptWindowMs;
    return Math.max(0, Math.ceil((deadline - nowTick) / 1000));
  }, [modalOrder, acceptWindowMs, nowTick]);

  const mmss = useMemo(() => {
    const m = Math.floor(secondsLeft / 60);
    const s = secondsLeft % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }, [secondsLeft]);

  const close = useCallback(async () => {
    stopOrderAlertSound();
    if (modalOrder) await addDismissed(modalOrder.ordersCoreId);
    setModalOrder(null);
    setRejectOpen(false);
    void refetch();
  }, [modalOrder, refetch]);

  const patchStatus = useCallback(
    async (
      status: "ACCEPTED" | "CANCELLED",
      extra?: { rejected_reason?: string },
      mode: "auto" | "manual" = "manual"
    ) => {
      if (!storeId || !token || !modalOrder || modalOrder.id.startsWith("core-")) return;
      const foodId = parseInt(modalOrder.id, 10);
      if (!Number.isFinite(foodId)) return;
      setActionLoading(true);
      try {
        await patchFoodOrderStatus(storeId, foodId, token, status, extra?.rejected_reason, {
          action_source: status === "CANCELLED" && mode === "auto" ? "system" : "app",
          accept_mode: mode,
          cancel_mode: mode,
        });
        await close();
      } catch {
        /* toast handled by caller if needed */
      } finally {
        setActionLoading(false);
      }
    },
    [storeId, token, modalOrder, close]
  );

  useEffect(() => {
    if (!modalOrder) {
      autoCancelFiredRef.current = null;
      return;
    }
    if (actionLoading || secondsLeft > 0) return;
    if (autoCancelFiredRef.current === modalOrder.ordersCoreId) return;
    autoCancelFiredRef.current = modalOrder.ordersCoreId;
    void patchStatus("CANCELLED", { rejected_reason: "Auto Cancelled" }, "auto");
  }, [secondsLeft, modalOrder, actionLoading, patchStatus]);

  if (!storeId) return null;

  const visible = !!modalOrder && !rejectOpen;
  const order = modalOrder;
  const acceptProgress =
    acceptWindowMs > 0
      ? Math.min(
          100,
          Math.max(
            0,
            Math.round(
              (1 - secondsLeft / Math.max(1, Math.round(acceptWindowMs / 1000))) * 100
            )
          )
        )
      : 0;

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={() => void close()}>
        <View style={styles.overlay}>
          <View
            style={[
              styles.panel,
              { paddingBottom: Math.max(insets.bottom, 16), maxHeight: "92%" },
            ]}
          >
            <View style={styles.header}>
              <Text style={styles.headerTitle}>1 new order</Text>
              <Pressable onPress={() => void close()} hitSlop={12} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color={GatiMitraMerchant.textSecondary} />
              </Pressable>
            </View>

            {order ? (
              <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
                <Text style={styles.orderId}>
                  {formatOrderIdDisplay(order.formattedOrderId, order.ordersCoreId)}
                </Text>
                <Text style={styles.customer}>{order.customerName}</Text>
                {order.dropAddress ? (
                  <Text style={styles.address} numberOfLines={3}>
                    {order.dropAddress}
                  </Text>
                ) : null}
                <View style={styles.itemsBox}>
                  {order.lineItems.slice(0, 6).map((it, i) => (
                    <Text key={`${it.name}-${i}`} style={styles.itemLine}>
                      {it.qty} × {it.name}
                    </Text>
                  ))}
                </View>
                <Text style={styles.total}>₹{order.total.toFixed(0)}</Text>
                {order.pickupOtp ? (
                  <View style={styles.otpRow}>
                    <Text style={styles.otpLabel}>Pickup OTP</Text>
                    <Text style={styles.otpCode}>{order.pickupOtp}</Text>
                  </View>
                ) : null}
              </ScrollView>
            ) : null}

            <View style={styles.actions}>
              <Pressable
                style={[styles.rejectBtn, actionLoading && styles.btnDisabled]}
                disabled={actionLoading}
                onPress={() => setRejectOpen(true)}
              >
                <Text style={styles.rejectText}>Reject</Text>
              </Pressable>
              <Pressable
                style={[styles.acceptBtn, (actionLoading || secondsLeft <= 0) && styles.btnDisabled]}
                disabled={actionLoading || secondsLeft <= 0}
                onPress={() => void patchStatus("ACCEPTED", undefined, "manual")}
              >
                <View style={[styles.acceptFill, { width: `${acceptProgress}%` }]} />
                {actionLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.acceptText}>Accept order ({mmss})</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {order ? (
        <RejectOrderSheet
          visible={rejectOpen}
          formattedOrderId={order.formattedOrderId}
          fallbackOrderId={order.ordersCoreId}
          loading={actionLoading}
          onClose={() => setRejectOpen(false)}
          onConfirm={(reason: MerchantCancellationReason) =>
            void patchStatus("CANCELLED", { rejected_reason: reason }, "manual")
          }
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  panel: {
    backgroundColor: "#fff",
    borderTopLeftRadius: CARD_RADIUS + 4,
    borderTopRightRadius: CARD_RADIUS + 4,
    paddingHorizontal: H_PADDING,
    paddingTop: 12,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
      },
      android: { elevation: 16 },
      default: {},
    }),
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GatiMitraMerchant.border,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  closeBtn: { padding: 4 },
  body: { maxHeight: 360 },
  bodyContent: { paddingVertical: 12, gap: 6 },
  orderId: { fontSize: 20, fontWeight: "800", color: GatiMitraMerchant.textPrimary },
  customer: { fontSize: 15, fontWeight: "600", color: GatiMitraMerchant.textPrimary },
  address: { fontSize: 13, color: GatiMitraMerchant.textSecondary, lineHeight: 18 },
  itemsBox: { marginTop: 8, gap: 4 },
  itemLine: { fontSize: 14, color: GatiMitraMerchant.textPrimary },
  total: { fontSize: 18, fontWeight: "700", marginTop: 8 },
  otpRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    padding: 10,
    backgroundColor: GatiMitraMerchant.surfaceWarm,
    borderRadius: 8,
  },
  otpLabel: { fontSize: 12, fontWeight: "600", color: GatiMitraMerchant.textSecondary },
  otpCode: {
    fontSize: 18,
    fontWeight: "800",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  actions: { flexDirection: "row", gap: 10, paddingTop: 12 },
  acceptBtn: {
    flex: 1.35,
    backgroundColor: "#059669",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    overflow: "hidden",
    position: "relative",
  },
  acceptFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(249, 115, 22, 0.35)",
  },
  acceptText: { color: "#fff", fontSize: 15, fontWeight: "700", zIndex: 1 },
  rejectBtn: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#EF4444",
  },
  rejectText: { color: "#B91C1C", fontSize: 15, fontWeight: "600" },
  btnDisabled: { opacity: 0.55 },
});
