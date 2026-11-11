import { Image as RNImage, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText as Text } from "@/components/AppText";
import { AppAssetImage } from "@/components/AppAssetImage";
import { GatiMitraMerchant } from "@/constants/theme";
import { MX } from "@/lib/appAssetKeys";

type Tab = "New" | "Active";

const LOCAL_EMPTY_ART = require("../../assets/dis.png");

function EmptyArtFallback({
  label,
  icon,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.fallbackIcon} accessibilityLabel={label}>
      <RNImage source={LOCAL_EMPTY_ART} style={styles.localArt} resizeMode="contain" />
      <Ionicons
        name={icon}
        size={36}
        color={GatiMitraMerchant.primary}
        style={styles.localBadge}
      />
    </View>
  );
}

export function DashboardOrdersEmptyState({
  tab,
  fillAvailable = false,
}: {
  tab: Tab;
  fillAvailable?: boolean;
}) {
  const assetKey = tab === "Active" ? MX.orders.emptyActive : MX.orders.emptyNew;
  const title = tab === "Active" ? "No active orders right now" : "Waiting for new orders";

  return (
    <View style={[styles.emptyWrap, fillAvailable && styles.emptyWrapFill]}>
      <AppAssetImage
        assetKey={assetKey}
        style={styles.emptyImage}
        resizeMode="contain"
        accessibilityLabel={title}
        fallback={
          <EmptyArtFallback
            label={title}
            icon={tab === "Active" ? "receipt-outline" : "hourglass-outline"}
          />
        }
      />
      <Text style={styles.emptyTitle}>{title}</Text>
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
  fallbackIcon: {
    width: 260,
    height: 260,
    marginBottom: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  localArt: {
    width: 210,
    height: 210,
    opacity: 0.92,
  },
  localBadge: {
    position: "absolute",
    bottom: 28,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
    textAlign: "center",
  },
});
