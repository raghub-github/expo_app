import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useOrdersContext } from "@/context/OrdersContext";
import { syncAcceptanceTimeout } from "@/services/ordersApi";
import { GatiMitraMerchant } from "@/constants/theme";

const syncedStoreIds = new Set<number>();

/**
 * On app open, flush expired unaccepted orders and show a dismissible toast.
 */
export default function AcceptanceTimeoutSync() {
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const { refetch } = useOrdersContext();
  const storeId = selectedStore?.id ?? null;
  const runningRef = useRef(false);
  const [toast, setToast] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissToast = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setToast(null);
  }, []);

  const runSync = useCallback(async () => {
    if (!token || !storeId) return;
    if (runningRef.current) return;
    if (syncedStoreIds.has(storeId)) return;

    runningRef.current = true;
    try {
      const { cancelled } = await syncAcceptanceTimeout(storeId, token);
      syncedStoreIds.add(storeId);
      if (cancelled > 0) {
        await refetch();
        const msg =
          cancelled === 1
            ? "1 order was auto-cancelled (acceptance window expired)"
            : `${cancelled} orders were auto-cancelled (acceptance window expired)`;
        setToast(msg);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setToast(null), 8000);
      }
    } catch {
      /* Backend timeout worker owns cancellation; sync is for UX toast only. */
    } finally {
      runningRef.current = false;
    }
  }, [token, storeId, refetch]);

  useEffect(() => {
    void runSync();
  }, [runSync]);

  useEffect(() => () => dismissToast(), [dismissToast]);

  if (!toast) return null;

  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.text}>{toast}</Text>
        <Pressable
          onPress={dismissToast}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        >
          <Text style={styles.close}>✕</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 56,
    left: 16,
    right: 16,
    zIndex: 9999,
    elevation: 20,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#1e293b",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  text: {
    flex: 1,
    color: GatiMitraMerchant.background,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
  },
  close: {
    color: "#94a3b8",
    fontSize: 16,
    fontWeight: "700",
  },
});
