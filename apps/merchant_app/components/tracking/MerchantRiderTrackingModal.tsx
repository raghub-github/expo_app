import React, { useMemo } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useMerchantRiderTracking } from "@/hooks/useMerchantRiderTracking";
import { MerchantRiderTrackingMap } from "@/components/tracking/MerchantRiderTrackingMap";

type Props = {
  visible: boolean;
  onClose: () => void;
  storeId: number | null | undefined;
  ordersFoodId: number | null | undefined;
  /** When the order is already terminal, freeze the marker (no live movement). */
  ended?: boolean;
};

export function isTerminalOrderStatus(status: string | null | undefined): boolean {
  const u = String(status ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  if (!u) return false;
  // Do not treat OUT_FOR_DELIVERY as terminal (`deliver` is a substring).
  if (u === "OUT_FOR_DELIVERY" || u === "IN_TRANSIT" || u === "PICKED_UP") return false;
  return (
    u === "DELIVERED" ||
    u === "COMPLETED" ||
    u === "CANCELLED" ||
    u === "CANCELED" ||
    u === "REJECTED" ||
    u === "RTO" ||
    u === "FAILED" ||
    u.includes("CANCEL") ||
    u.includes("REJECT")
  );
}

export function MerchantRiderTrackingModal({ visible, onClose, storeId, ordersFoodId, ended }: Props) {
  const { data, loading, error } = useMerchantRiderTracking({
    storeId,
    ordersFoodId,
    enabled: visible,
  });

  const payload = useMemo(() => {
    if (!data) return null;
    return { ...data.map, ended: Boolean(ended) };
  }, [data, ended]);

  const rider = data?.rider;
  const hasFix = data?.center != null && data.map.riderLat != null;
  const approachText = useMemo(() => {
    const a = data?.approach;
    if (!a) return null;
    const km = a.distanceMeters != null ? (a.distanceMeters / 1000).toFixed(1) : null;
    const min = a.etaMinutes != null ? Math.max(1, Math.round(a.etaMinutes)) : null;
    if (km == null && min == null) return null;
    return [km != null ? `${km} km` : null, min != null ? `${min} min` : null].filter(Boolean).join(" · ");
  }, [data?.approach]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent={false}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>
              {rider?.name?.trim() || "Delivery partner"}
            </Text>
            <Text style={styles.sub} numberOfLines={1}>
              {rider?.assignment_status ? String(rider.assignment_status).replace(/_/g, " ") : "Live location"}
              {approachText ? ` · ${approachText} to store` : ""}
            </Text>
          </View>
          {hasFix && data?.source === "live_location" ? (
            <View style={styles.liveChip}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          ) : null}
          <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn} accessibilityRole="button">
            <Text style={styles.closeTxt}>✕</Text>
          </Pressable>
        </View>

        <View style={styles.mapWrap}>
          {data?.center && payload ? (
            <MerchantRiderTrackingMap center={data.center} payload={payload} style={styles.map} />
          ) : (
            <View style={styles.placeholder}>
              {loading ? (
                <>
                  <ActivityIndicator color="#f97316" />
                  <Text style={styles.placeholderTxt}>Loading rider location…</Text>
                </>
              ) : (
                <Text style={styles.placeholderTxt}>
                  {error
                    ? "Couldn't load live location. Retrying…"
                    : "Rider location will appear once the partner is en route."}
                </Text>
              )}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
  },
  title: { fontSize: 16, fontWeight: "800", color: "#111827" },
  sub: { marginTop: 2, fontSize: 12.5, color: "#6b7280" },
  liveChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#ecfdf5",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#16a34a" },
  liveText: { fontSize: 10.5, fontWeight: "800", color: "#15803d", letterSpacing: 0.4 },
  closeBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "#f3f4f6" },
  closeTxt: { fontSize: 15, color: "#374151", fontWeight: "700" },
  mapWrap: { flex: 1, padding: 12 },
  map: { flex: 1 },
  placeholder: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#f8fafc", borderRadius: 12 },
  placeholderTxt: { color: "#64748b", fontSize: 13, textAlign: "center", paddingHorizontal: 24 },
});
