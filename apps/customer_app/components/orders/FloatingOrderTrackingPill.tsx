/**
 * GatiMitra-style floating active-order pill — white bar above tab nav.
 */

import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { GatiMitraColors } from "@/constants/gatimitra";
import type { ActiveOrder } from "@/store/orderStore";
import { getFloatingOrderStatusText } from "@/lib/customer-order-status-display";
import { PartnerChatUnreadBadge } from "@/components/orders/PartnerChatUnreadBadge";

const MINT = GatiMitraColors.primaryMint;
const MINT_DARK = GatiMitraColors.deepMintStart;

type FloatingOrderTrackingPillProps = {
  order: ActiveOrder;
  onPress: () => void;
  chatUnreadCount?: number;
};

export function FloatingOrderTrackingPill({
  order,
  onPress,
  chatUnreadCount = 0,
}: FloatingOrderTrackingPillProps) {
  const storeLabel = order.storeName?.trim() || "Your order";
  const statusLine = getFloatingOrderStatusText(order.status);
  const etaMins = order.etaMinutes > 0 ? order.etaMinutes : null;

  return (
    <TouchableOpacity activeOpacity={0.92} onPress={onPress} style={styles.touchable}>
      <View style={styles.shell}>
        <PartnerChatUnreadBadge count={chatUnreadCount} style={styles.floatingUnreadBadge} />
        <View style={styles.scooterWrap}>
          <Ionicons name="bicycle" size={26} color="#111827" />
        </View>

        <View style={styles.centerCol}>
          <Text style={styles.storeName} numberOfLines={1}>
            {storeLabel}
          </Text>
          <View style={styles.statusRow}>
            <Text style={styles.statusText} numberOfLines={1}>
              {statusLine}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={GatiMitraColors.warmOrange} />
          </View>
        </View>

        <LinearGradient
          colors={[MINT_DARK, MINT]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.etaPill}
        >
          <Text style={styles.etaTop}>arriving in</Text>
          <Text style={styles.etaBottom}>{etaMins != null ? `${etaMins} mins` : "soon"}</Text>
        </LinearGradient>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  touchable: {
    width: "100%",
  },
  shell: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ECECEC",
    position: "relative",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
      },
      android: { elevation: 8 },
    }),
  },
  floatingUnreadBadge: {
    position: "absolute",
    top: 4,
    right: 8,
    zIndex: 2,
  },
  scooterWrap: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  centerCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  storeName: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
    letterSpacing: -0.2,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginTop: 2,
  },
  statusText: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "500",
    color: "#374151",
  },
  etaPill: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 72,
  },
  etaTop: {
    fontSize: 10,
    fontWeight: "600",
    color: "rgba(255,255,255,0.92)",
    textTransform: "lowercase",
  },
  etaBottom: {
    fontSize: 13,
    fontWeight: "800",
    color: "#FFFFFF",
    marginTop: 1,
  },
});
