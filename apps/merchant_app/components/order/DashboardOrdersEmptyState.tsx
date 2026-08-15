import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet } from "react-native";
import { AppAssetImage } from "@/components/AppAssetImage";
import { GatiMitraMerchant } from "@/constants/theme";
import { MX } from "@/lib/appAssetKeys";

type Tab = "New" | "Active";

export function DashboardOrdersEmptyState({
  tab,
  fillAvailable = false,
}: {
  tab: Tab;
  fillAvailable?: boolean;
}) {
  if (tab === "Active") {
    return (
      <View style={[styles.emptyWrap, fillAvailable && styles.emptyWrapFill]}>
        <AppAssetImage
          assetKey={MX.orders.emptyActive}
          style={styles.emptyImage}
          resizeMode="contain"
          accessibilityLabel="No active orders"
        />
        <Text style={styles.emptyTitle}>No active orders right now</Text>
      </View>
    );
  }

  return (
    <View style={[styles.emptyWrap, fillAvailable && styles.emptyWrapFill]}>
      <AppAssetImage
        assetKey={MX.orders.emptyNew}
        style={styles.emptyImage}
        resizeMode="contain"
        accessibilityLabel="Waiting for new orders"
      />
      <Text style={styles.emptyTitle}>Waiting for new orders</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  emptyWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
    paddingHorizontal: 20,
    minHeight: 280,
    backgroundColor: GatiMitraMerchant.surfaceWarm,
  },
  emptyWrapFill: {
    flex: 1,
    minHeight: 0,
  },
  emptyImage: {
    width: 260,
    height: 260,
    marginBottom: 14,
    backgroundColor: "transparent",
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
    textAlign: "center",
  },
});
