/**
 * Low rider availability strip above the GatiCash / place-order footer.
 * Fixed height so Refresh ↔ spinner never resizes the row.
 */

import { View, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CheckoutText } from "@/components/checkout/CheckoutText";
import { MerchantDarkPalette, useMerchantUiDark } from "@/features/merchant-detail/merchantUiTheme";
import { GatiMitraColors } from "@/constants/gatimitra";

const ROW_H = 42;
const REFRESH_COLOR = GatiMitraColors.deepMintStart;
const REFRESH_COLOR_DARK = "#86EFAC";

type Props = {
  refreshing?: boolean;
  onRefresh: () => void;
};

export function CheckoutRiderUnavailableBanner({ refreshing = false, onRefresh }: Props) {
  const dark = useMerchantUiDark();
  const refreshColor = dark ? REFRESH_COLOR_DARK : REFRESH_COLOR;

  return (
    <View
      style={[styles.banner, dark && styles.bannerDark]}
      accessibilityRole="alert"
      accessibilityLabel="Low rider availability in your area"
    >
      <View style={styles.messageRow}>
        <Ionicons
          name="bicycle-outline"
          size={16}
          color={dark ? "#FECACA" : "#B91C1C"}
          style={styles.leadIcon}
        />
        <CheckoutText style={[styles.message, dark && styles.messageDark]} numberOfLines={1}>
          Low rider availability in your area!
        </CheckoutText>
      </View>
      <Pressable
        onPress={onRefresh}
        disabled={refreshing}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Refresh rider availability"
        style={({ pressed }) => [
          styles.refreshHit,
          dark && styles.refreshHitDark,
          pressed && styles.refreshPressed,
        ]}
      >
        <View style={styles.refreshSlot}>
          {refreshing ? (
            <ActivityIndicator size="small" color={refreshColor} />
          ) : (
            <>
              <Ionicons name="refresh" size={13} color={refreshColor} />
              <CheckoutText style={[styles.refresh, { color: refreshColor }]} bold>
                Refresh
              </CheckoutText>
            </>
          )}
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    height: ROW_H,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 12,
    backgroundColor: "#FEF2F2",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#FECACA",
  },
  bannerDark: {
    backgroundColor: "#6B1D1D",
    borderTopColor: "#7F1D1D",
  },
  messageRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  leadIcon: {
    flexShrink: 0,
  },
  message: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    color: "#B91C1C",
    letterSpacing: -0.1,
  },
  messageDark: {
    color: "#FFFFFF",
  },
  refreshHit: {
    flexShrink: 0,
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
    justifyContent: "center",
  },
  refreshHitDark: {
    backgroundColor: "rgba(22, 163, 74, 0.22)",
    borderColor: "rgba(134, 239, 172, 0.4)",
  },
  refreshSlot: {
    minWidth: 72,
    height: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  refreshPressed: { opacity: 0.75 },
  refresh: {
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16,
  },
});
