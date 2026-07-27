import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useActiveOrderPicker } from "@/src/hooks/useActiveOrderPicker";
import { ActiveOrderPickerSheet } from "@/src/components/orders/ActiveOrderPickerSheet";
import { getActiveOrderStatusCopy } from "@/src/lib/active-order-display";
import { colors } from "@/src/theme";

/** @deprecated Prefer floating Active Ride button — kept for reference. */
const DOCK_BOTTOM_GAP = 0;

/** Bottom dock — resume active ride when rider is on the home map. */
export function ActiveRideResumePill() {
  const {
    primary,
    sheetOpen,
    setSheetOpen,
    handleActiveOrderPress,
    openOrderNavigation,
    activeOrders,
  } = useActiveOrderPicker();

  if (!primary) return null;

  const copy = getActiveOrderStatusCopy(primary);
  const tripId = primary.formattedOrderId?.trim() || primary.id;
  const multiHint =
    activeOrders.length > 1 ? ` · ${activeOrders.length} active` : "";

  return (
    <>
      <Pressable
        onPress={handleActiveOrderPress}
        style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={copy.title}
      >
        <View style={styles.pill}>
          <View style={styles.iconWrap}>
            <Ionicons name="navigate" size={16} color="#fff" />
          </View>
          <View style={styles.textCol}>
            <Text style={styles.title} numberOfLines={1}>
              {copy.title}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {tripId} · {copy.subtitle}
              {multiHint}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.9)" />
        </View>
      </Pressable>
      <ActiveOrderPickerSheet
        visible={sheetOpen}
        orders={activeOrders}
        onDismiss={() => setSheetOpen(false)}
        onSelect={openOrderNavigation}
      />
    </>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: DOCK_BOTTOM_GAP,
    alignItems: "center",
    zIndex: 18,
  },
  pressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    maxWidth: "100%",
    backgroundColor: colors.primary[600],
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.primary[500],
    shadowColor: "#0f766e",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 6,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  textCol: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
  },
  subtitle: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 1,
  },
});
