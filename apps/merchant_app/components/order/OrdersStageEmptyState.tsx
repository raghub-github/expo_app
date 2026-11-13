import { Image as RNImage, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText as Text } from "@/components/AppText";
import { AppAssetImage } from "@/components/AppAssetImage";
import { GatiMitraMerchant } from "@/constants/theme";
import {
  type OrderStageEmptyKey,
  orderStageEmptyAssetKey,
} from "@/lib/orderStageAssets";

const STAGE_LABELS: Record<OrderStageEmptyKey, string> = {
  preparing: "Preparing",
  ready: "Ready",
  picked_up: "Picked Up",
  completed: "Completed",
  rto: "RTO",
  scheduled: "Scheduled",
};

const STAGE_FALLBACK_ICON: Record<OrderStageEmptyKey, keyof typeof Ionicons.glyphMap> = {
  preparing: "restaurant-outline",
  ready: "checkmark-circle-outline",
  picked_up: "bicycle-outline",
  completed: "ribbon-outline",
  rto: "return-down-back-outline",
  scheduled: "calendar-outline",
};

const LOCAL_EMPTY_ART = require("../../assets/dis.png");

export function OrdersStageEmptyState({
  stage,
  message,
}: {
  stage: OrderStageEmptyKey;
  message?: string;
}) {
  const assetKey = orderStageEmptyAssetKey(stage);
  const label = STAGE_LABELS[stage];
  const caption = message ?? `No ${label.toLowerCase()} orders right now`;

  return (
    <View style={styles.wrap}>
      <View style={styles.imageFrame}>
        <AppAssetImage
          assetKey={assetKey}
          style={styles.image}
          resizeMode="contain"
          accessibilityLabel={caption}
          fallback={
            <View style={styles.fallbackIcon} accessibilityLabel={caption}>
              <RNImage source={LOCAL_EMPTY_ART} style={styles.localArt} resizeMode="contain" />
              <Ionicons
                name={STAGE_FALLBACK_ICON[stage]}
                size={36}
                color={GatiMitraMerchant.primary}
                style={styles.localBadge}
              />
            </View>
          }
        />
      </View>
      <Text style={styles.text}>{caption}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 16,
    minHeight: 360,
    backgroundColor: "transparent",
  },
  imageFrame: {
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  image: {
    width: 268,
    height: 268,
    backgroundColor: "transparent",
  },
  fallbackIcon: {
    width: 268,
    height: 268,
    alignItems: "center",
    justifyContent: "center",
  },
  localArt: {
    width: 220,
    height: 220,
    opacity: 0.92,
  },
  localBadge: {
    position: "absolute",
    bottom: 36,
  },
  text: {
    fontSize: 15,
    fontWeight: "500",
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
    paddingHorizontal: 8,
  },
});
