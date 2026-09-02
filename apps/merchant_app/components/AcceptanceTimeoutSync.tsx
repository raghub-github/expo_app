import { useCallback, useEffect, useRef, useState } from "react";
import { AppText as Text } from "@/components/AppText";
import { Pressable, StyleSheet, View } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useOrdersContext } from "@/context/OrdersContext";
import { isAppForeground } from "@/lib/appForeground";
import { syncAcceptanceTimeout } from "@/services/ordersApi";
import { GatiMitraMerchant } from "@/constants/theme";

const syncedStoreIds = new Set<number>();

/**
 * On app open / resume / when pending created orders exist, flush expired
 * unaccepted orders via the backend (single cancel authority) and toast if any.
 */
export default function AcceptanceTimeoutSync() {
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const { refetch, orders } = useOrdersContext();
  const storeId = selectedStore?.id ?? null;
  const runningRef = useRef(false);
  const [toast, setToast] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncAtRef = useRef(0);

  const dismissToast = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setToast(null);
  }, []);

  const runSync = useCallback(
    async (opts?: { force?: boolean }) => {
      if (!token || !storeId) return;
      if (runningRef.current) return;
      const now = Date.now();
      if (!opts?.force && syncedStoreIds.has(storeId) && now - lastSyncAtRef.current < 20_000) {
        return;
      }

      runningRef.current = true;
      try {
        const { cancelled } = await syncAcceptanceTimeout(storeId, token);
        syncedStoreIds.add(storeId);
        lastSyncAtRef.current = Date.now();
        if (cancelled > 0) {
          await refetch();
        }
        if (cancelled > 0) {
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
    },
    [token, storeId, refetch]
  );

  useEffect(() => {
    void runSync({ force: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount / store switch only
  }, [token, storeId]);

  const hasPendingCreated = orders.some(
    (o) => o.status === "created" && !o.id.startsWith("core-")
  );

  useEffect(() => {
    if (!hasPendingCreated) return undefined;
    const id = setInterval(() => {
      if (!isAppForeground()) return;
      void runSync();
    }, 60_000);
    return () => clearInterval(id);
  }, [hasPendingCreated, runSync]);

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
