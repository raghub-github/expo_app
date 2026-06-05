import React, { useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { DismissibleBottomSheetShell } from "@/src/components/language/DismissibleBottomSheetShell";
import { useTabBarBottomOffset } from "@/src/hooks/useTabBarBottomOffset";
import type { RiderOrderSummary } from "@/src/services/api/riderApi";
import {
  formatActiveOrderEarning,
  getActiveOrderFloatingIcon,
  pickPrimaryActiveOrder,
} from "@/src/lib/active-order-display";
import { colors } from "@/src/theme";

type Props = {
  visible: boolean;
  orders: RiderOrderSummary[];
  onDismiss: () => void;
  onSelect: (order: RiderOrderSummary) => void;
};

type CategoryTheme = {
  gradient: readonly [string, string];
  ring: string;
  accent: string;
};

function categoryTheme(category: RiderOrderSummary["category"]): CategoryTheme {
  if (category === "food") {
    return {
      gradient: ["#0F766E", "#14B8A6"],
      ring: colors.primary[100],
      accent: colors.primary[700],
    };
  }
  if (category === "parcel") {
    return {
      gradient: ["#B45309", "#F59E0B"],
      ring: colors.warning[100],
      accent: colors.warning[800],
    };
  }
  return {
    gradient: ["#1D4ED8", "#3B82F6"],
    ring: colors.secondary[100],
    accent: colors.secondary[700],
  };
}

function formatAwayShort(km?: number | null): string | null {
  if (km == null || !Number.isFinite(km) || km <= 0) return null;
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

function resolvePickupShort(order: RiderOrderSummary, t: (k: string, d: string) => string): string {
  const away = formatAwayShort(order.pickupDistanceKm);
  if (away) return away;
  if (order.atPickup) return t("orders.activeFloat.atPickup", "At pickup");
  if (order.status === "picked_up" || order.status === "in_transit" || order.rideStarted) {
    return t("orders.activeFloat.pickedUp", "Picked up");
  }
  return "—";
}

function resolveDropShort(order: RiderOrderSummary): string {
  const km = order.tripDistanceKm ?? order.distanceKm ?? order.totalDistanceKm;
  return formatAwayShort(km) ?? "—";
}

function StatBox({
  icon,
  label,
  value,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  value: string;
}) {
  return (
    <View style={styles.statBox}>
      <View style={styles.statIconWrap}>
        <Ionicons name={icon} size={13} color={colors.primary[700]} />
      </View>
      <View style={styles.statTextWrap}>
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={styles.statValue} numberOfLines={1}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function ActiveOrderPickerCard({
  order,
  isPrimary,
  onPress,
}: {
  order: RiderOrderSummary;
  isPrimary: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const theme = categoryTheme(order.category);
  const tripId = order.formattedOrderId?.trim() || order.id;
  const earning = formatActiveOrderEarning(order);
  const icon = getActiveOrderFloatingIcon(order);
  const subtitle =
    order.category === "food"
      ? order.merchantName?.trim() ||
        t("orders.activeFloat.foodFallback", "Food delivery")
      : order.category === "ride"
        ? order.rideType?.replace(/_/g, " ") || t("orders.activeFloat.rideFallback", "Ride")
        : t("orders.activeFloat.parcelFallback", "Parcel delivery");

  return (
    <View style={[styles.card, isPrimary && styles.cardLive]}>
      <LinearGradient
        colors={theme.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.cardStripe}
      />

      {isPrimary ? (
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>{t("orders.activeFloat.live", "Live")}</Text>
        </View>
      ) : null}

      <View style={styles.cardInner}>
        <View style={styles.headRow}>
          <View style={[styles.iconRing, { backgroundColor: theme.ring }]}>
            <LinearGradient colors={theme.gradient} style={styles.iconCore}>
              <Ionicons name={icon} size={17} color="#fff" />
            </LinearGradient>
          </View>

          <View style={styles.headCopy}>
            <View style={styles.idRow}>
              <Text style={styles.tripId} numberOfLines={1}>
                {tripId}
              </Text>
              {earning ? <Text style={styles.earn}>{earning}</Text> : null}
            </View>
            <Text style={styles.merchant} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <StatBox
            icon="location-outline"
            label={t("orders.activeFloat.pickupLabel", "Pickup")}
            value={resolvePickupShort(order, t)}
          />
          <StatBox
            icon="navigate-outline"
            label={t("orders.activeFloat.dropLabel", "Drop")}
            value={resolveDropShort(order)}
          />
        </View>

        <Pressable
          onPress={onPress}
          style={({ pressed }) => [styles.navBtnWrap, pressed && styles.navBtnPressed]}
          accessibilityRole="button"
          accessibilityLabel={t("orders.activeFloat.startTrip", "Start Trip")}
        >
          <LinearGradient
            colors={isPrimary ? ["#0F766E", "#0D9488"] : ["#115E59", "#0F766E"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.navBtn}
          >
            <View style={styles.navBtnIconCircle}>
              <Ionicons name="navigate" size={14} color={colors.primary[800]} />
            </View>
            <Text style={styles.navBtnText}>
              {t("orders.activeFloat.startTrip", "Start Trip")}
            </Text>
            <View style={styles.navBtnArrow}>
              <Ionicons name="arrow-forward" size={14} color="#fff" />
            </View>
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

export function ActiveOrderPickerSheet({ visible, orders, onDismiss, onSelect }: Props) {
  const { t } = useTranslation();
  const tabBarOffset = useTabBarBottomOffset();

  const { sortedOrders, primaryId } = useMemo(() => {
    if (orders.length <= 1) {
      return { sortedOrders: orders, primaryId: orders[0]?.id ?? null };
    }
    const primary = pickPrimaryActiveOrder(orders);
    if (!primary) return { sortedOrders: orders, primaryId: null };
    const rest = orders.filter((o) => o.id !== primary.id);
    return { sortedOrders: [primary, ...rest], primaryId: primary.id };
  }, [orders]);

  return (
    <DismissibleBottomSheetShell
      visible={visible}
      onDismiss={onDismiss}
      maxHeightRatio={0.7}
      showOuterHandle={false}
      bottomOffset={tabBarOffset}
      sheetStyle={styles.sheet}
    >
      <View style={styles.handle} />

      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.headerTitle}>
            {t("orders.activeFloat.activeOrdersTitle", "Active Orders")}
          </Text>
          <View style={styles.countPill}>
            <Text style={styles.countPillText}>{orders.length}</Text>
          </View>
        </View>
        <Text style={styles.headerSub}>
          {t("orders.activeFloat.activeOrdersHint", "Choose an order to start navigation")}
        </Text>
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {sortedOrders.map((order) => (
          <ActiveOrderPickerCard
            key={order.id}
            order={order}
            isPrimary={order.id === primaryId}
            onPress={() => onSelect(order)}
          />
        ))}
      </ScrollView>
    </DismissibleBottomSheetShell>
  );
}

const cardShadow = Platform.select({
  ios: {
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
  },
  android: { elevation: 3 },
  default: {},
});

const styles = StyleSheet.create({
  sheet: {
    paddingTop: 0,
    paddingHorizontal: 0,
    backgroundColor: "#FFFFFF",
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 99,
    backgroundColor: colors.gray[200],
    marginTop: 8,
  },
  header: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.gray[100],
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.gray[900],
    letterSpacing: -0.3,
  },
  countPill: {
    minWidth: 26,
    height: 26,
    paddingHorizontal: 8,
    borderRadius: 13,
    backgroundColor: colors.primary[50],
    borderWidth: 1,
    borderColor: colors.primary[100],
    alignItems: "center",
    justifyContent: "center",
  },
  countPillText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.primary[700],
  },
  headerSub: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "500",
    color: colors.gray[500],
  },
  list: { maxHeight: 400 },
  listContent: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 12,
  },
  card: {
    borderRadius: 16,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.gray[100],
    overflow: "hidden",
    ...cardShadow,
  },
  cardLive: {
    borderColor: colors.primary[200],
  },
  cardStripe: {
    height: 3,
    width: "100%",
  },
  liveBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    zIndex: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.success[50],
    borderWidth: 1,
    borderColor: colors.success[200],
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success[500],
  },
  liveText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.success[700],
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  cardInner: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
  },
  headRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconRing: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  iconCore: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  headCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 52,
  },
  idRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  tripId: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    fontWeight: "800",
    color: colors.gray[900],
  },
  earn: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.primary[700],
    flexShrink: 0,
  },
  merchant: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "500",
    color: colors.gray[500],
  },
  statsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  statBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.gray[50],
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.gray[100],
    minWidth: 0,
  },
  statIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  statTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  statLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.gray[400],
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  statValue: {
    marginTop: 1,
    fontSize: 12,
    fontWeight: "700",
    color: colors.gray[800],
  },
  navBtnWrap: {
    marginTop: 10,
  },
  navBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    paddingVertical: 11,
    paddingHorizontal: 6,
    gap: 8,
  },
  navBtnIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 4,
  },
  navBtnText: {
    flex: 1,
    textAlign: "center",
    fontSize: 14,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 0.2,
  },
  navBtnArrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
  },
  navBtnPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
});
