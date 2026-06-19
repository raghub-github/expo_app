// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
import React from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useRideOrder } from "@/src/hooks/useOrders";
import { colors } from "@/src/theme";
import { formatDistanceKm } from "@/src/lib/incoming-order-display";
import {
  formatRideHistoryListDate,
  orderHistoryCategoryLabel,
  orderHistoryCategoryVisual,
  orderHistoryTitle,
  rideHistoryDropLabel,
  rideHistoryEarningLabel,
  rideHistoryOrderId,
  rideHistoryPickupLabel,
  rideHistoryStatusLabel,
  rideHistoryStatusTone,
  resolveOrderDistanceBreakdown,
} from "@/src/lib/rider-ride-history-display";

const GREEN = colors.success[600];

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function DistanceStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.distStat}>
      <Text style={styles.distStatLabel}>{label}</Text>
      <Text style={styles.distStatValue}>{value}</Text>
    </View>
  );
}

export function OrderHistoryDetailScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id: string; category?: string }>();
  const orderId = typeof params.id === "string" ? params.id : Array.isArray(params.id) ? params.id[0] : "";

  const { data: order, isLoading, refetch } = useRideOrder(orderId, {
    refetchInterval: false,
  });

  if (!orderId) {
    return (
      <SafeAreaView style={styles.root}>
        <Text style={styles.errorText}>{t("profile.myOrders.invalidOrder", "Invalid order")}</Text>
      </SafeAreaView>
    );
  }

  const visual = order ? orderHistoryCategoryVisual(order.category) : orderHistoryCategoryVisual("ride");
  const statusTone = order ? rideHistoryStatusTone(order.status) : rideHistoryStatusTone("delivered");
  const distance = order ? resolveOrderDistanceBreakdown(order) : null;
  const showDistanceGrid =
    distance != null &&
    (distance.pickupKm != null || distance.tripKm != null || distance.totalKm != null);

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.headerTitle}>{t("profile.myOrders.detailTitle", "Order details")}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {isLoading && !order ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={GREEN} />
        </View>
      ) : !order ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>
            {t("profile.myOrders.detailError", "Could not load order details")}
          </Text>
          <Pressable onPress={() => refetch()} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>{t("common.retry", "Retry")}</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.heroCard, { borderColor: visual.accent }]}>
            <View style={[styles.heroIcon, { backgroundColor: visual.iconBg }]}>
              <Ionicons name={visual.icon} size={28} color={visual.iconColor} />
            </View>
            <View style={styles.heroText}>
              <View style={styles.heroBadgeRow}>
                <Text style={[styles.catPill, { color: visual.accent, backgroundColor: `${visual.accent}14` }]}>
                  {orderHistoryCategoryLabel(order.category, t)}
                </Text>
                <View
                  style={[
                    styles.statusPill,
                    { backgroundColor: statusTone.bg, borderColor: statusTone.border },
                  ]}
                >
                  <Text style={[styles.statusPillText, { color: statusTone.color }]}>
                    {rideHistoryStatusLabel(order.status, t, order)}
                  </Text>
                </View>
              </View>
              <Text style={styles.heroTitle}>{orderHistoryTitle(order)}</Text>
              <Text style={styles.heroMeta}>{rideHistoryOrderId(order)}</Text>
              <Text style={styles.heroMeta}>{formatRideHistoryListDate(order.createdAt)}</Text>
            </View>
          </View>

          <View style={styles.earnCard}>
            <Text style={styles.earnCardLabel}>
              {t("profile.myOrders.earned", "Earned")}
            </Text>
            <Text style={styles.earnCardAmount}>{rideHistoryEarningLabel(order, t)}</Text>
            {showDistanceGrid && distance ? (
              <View style={styles.distanceGrid}>
                {distance.pickupKm != null ? (
                  <>
                    <DistanceStat
                      label={t("profile.myOrders.toPickup", "To pickup")}
                      value={formatDistanceKm(distance.pickupKm)}
                    />
                    {distance.tripKm != null ? <View style={styles.distanceGridDivider} /> : null}
                  </>
                ) : null}
                {distance.tripKm != null ? (
                  <>
                    <DistanceStat
                      label={t("profile.myOrders.dropDistance", "Drop")}
                      value={formatDistanceKm(distance.tripKm)}
                    />
                    {distance.totalKm != null &&
                    distance.pickupKm != null &&
                    distance.tripKm != null ? (
                      <View style={styles.distanceGridDivider} />
                    ) : null}
                  </>
                ) : null}
                {distance.totalKm != null &&
                distance.pickupKm != null &&
                distance.tripKm != null ? (
                  <DistanceStat
                    label={t("profile.myOrders.totalDistance", "Total")}
                    value={formatDistanceKm(distance.totalKm)}
                  />
                ) : null}
              </View>
            ) : distance?.totalKm != null || distance?.tripKm != null ? (
              <Text style={styles.earnCardDist}>
                {formatDistanceKm(distance.totalKm ?? distance.tripKm)}{" "}
                {t("profile.myOrders.tripDistance", "trip distance")}
              </Text>
            ) : null}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {t("profile.myOrders.routeSection", "Route")}
            </Text>
            <View style={styles.routeCard}>
              <View style={styles.routeRow}>
                <View style={[styles.routeDot, { backgroundColor: "#EA580C" }]} />
                <View style={styles.routeCol}>
                  <Text style={styles.routeLblPickup}>PICKUP</Text>
                  <Text style={styles.routeAddr}>{rideHistoryPickupLabel(order)}</Text>
                </View>
              </View>
              <View style={styles.routeLine} />
              <View style={styles.routeRow}>
                <View style={[styles.routeDot, { backgroundColor: GREEN }]} />
                <View style={styles.routeCol}>
                  <Text style={styles.routeLblDrop}>DROP</Text>
                  <Text style={styles.routeAddr}>{rideHistoryDropLabel(order)}</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {t("profile.myOrders.infoSection", "Order info")}
            </Text>
            <View style={styles.infoCard}>
              {order.merchantName ? (
                <DetailRow
                  label={t("profile.myOrders.merchant", "Restaurant")}
                  value={order.merchantName}
                />
              ) : null}
              {order.customerName ? (
                <DetailRow
                  label={t("profile.myOrders.customer", "Customer")}
                  value={order.customerName}
                />
              ) : null}
              {order.itemCount != null && order.itemCount > 0 ? (
                <DetailRow
                  label={t("profile.myOrders.items", "Items")}
                  value={String(order.itemCount)}
                />
              ) : null}
            </View>
          </View>

          <Pressable
            onPress={() => router.push("/raise-ticket")}
            style={styles.supportBtn}
          >
            <Ionicons name="help-circle-outline" size={20} color={GREEN} />
            <Text style={styles.supportBtnText}>
              {t("profile.myOrders.needHelp", "Need help with this order?")}
            </Text>
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          </Pressable>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F4F6F8" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
  },
  headerSpacer: { width: 40 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  errorText: { fontSize: 15, color: "#64748B", textAlign: "center" },
  retryBtn: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: GREEN,
  },
  retryBtnText: { color: "#FFFFFF", fontWeight: "700" },
  scroll: { padding: 16, paddingBottom: 32 },
  heroCard: {
    flexDirection: "row",
    gap: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderLeftWidth: 4,
    marginBottom: 12,
    ...Platform.select({
      ios: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  heroText: { flex: 1, minWidth: 0 },
  heroBadgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  catPill: {
    fontSize: 11,
    fontWeight: "800",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: "hidden",
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusPillText: { fontSize: 11, fontWeight: "700" },
  heroTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 4,
  },
  heroMeta: { fontSize: 13, color: "#94A3B8", marginBottom: 2 },
  earnCard: {
    backgroundColor: "#ECFDF5",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  earnCardLabel: { fontSize: 12, fontWeight: "600", color: "#047857" },
  earnCardAmount: {
    fontSize: 28,
    fontWeight: "800",
    color: GREEN,
    marginTop: 4,
  },
  earnCardDist: { fontSize: 13, color: "#047857", marginTop: 6 },
  distanceGrid: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#A7F3D0",
  },
  distanceGridDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: "#A7F3D0",
    marginHorizontal: 8,
  },
  distStat: { flex: 1, minWidth: 0, alignItems: "center" },
  distStatLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#047857",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginBottom: 4,
    textAlign: "center",
  },
  distStatValue: {
    fontSize: 14,
    fontWeight: "800",
    color: GREEN,
    textAlign: "center",
  },
  section: { marginBottom: 16 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  routeCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  routeRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  routeDot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  routeCol: { flex: 1 },
  routeLblPickup: {
    fontSize: 10,
    fontWeight: "800",
    color: "#EA580C",
    marginBottom: 4,
  },
  routeLblDrop: {
    fontSize: 10,
    fontWeight: "800",
    color: GREEN,
    marginBottom: 4,
  },
  routeAddr: { fontSize: 14, fontWeight: "500", color: "#334155", lineHeight: 20 },
  routeLine: {
    width: 2,
    height: 16,
    backgroundColor: "#CBD5E1",
    marginLeft: 4,
    marginVertical: 8,
  },
  infoCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F1F5F9",
    gap: 10,
  },
  detailLabel: { fontSize: 11, fontWeight: "700", color: "#94A3B8", marginBottom: 2 },
  detailValue: { flex: 1, fontSize: 15, fontWeight: "600", color: "#0F172A" },
  supportBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  supportBtnText: { flex: 1, fontSize: 14, fontWeight: "600", color: "#334155" },
});
