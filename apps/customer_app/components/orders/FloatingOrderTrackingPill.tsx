/**
 * Floating active-order pill — same chrome as View Cart bar (mint bar + green CTA).
 * No remove/X control; tap opens order tracking.
 */

import { useMemo, useState } from "react";
import { View, TouchableOpacity, StyleSheet, Pressable } from "react-native";
import { Image } from "expo-image";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";
import { StoreFonts } from "@/constants/storeTypography";
import { StoreText } from "@/components/store/StoreText";
import type { ActiveOrder } from "@/store/orderStore";
import { getFloatingOrderStatusText } from "@/lib/customer-order-status-display";
import { formatSingleEtaMinutes } from "@/lib/order-eta-display";
import { PartnerChatUnreadBadge } from "@/components/orders/PartnerChatUnreadBadge";
import { merchantService } from "@/services/merchant.service";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";

const FLOAT_CART_GREEN = "#137243";
const FLOAT_CART_RADIUS = 10;
const FLOAT_BAR_BG = "#E8F5EE";
const FLOAT_BAR_BORDER = "rgba(19, 114, 67, 0.22)";
const DOCK_PILL_MIN_HEIGHT = 60;

type FloatingOrderTrackingPillProps = {
  order: ActiveOrder;
  onPress: () => void;
  chatUnreadCount?: number;
  /** Kept for call-site compat; cart-matching UI is always the same height/chrome. */
  emphasis?: "primary" | "secondary";
};

export function FloatingOrderTrackingPill({
  order,
  onPress,
  chatUnreadCount = 0,
}: FloatingOrderTrackingPillProps) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const storeId = order.storeId?.trim() || null;
  const storeLabel = order.storeName?.trim() || "Your order";
  const statusLine = getFloatingOrderStatusText(order.status);
  const etaLabel = formatSingleEtaMinutes(order.etaMinutes > 0 ? order.etaMinutes : null);
  const showEta = order.etaMinutes > 0;

  const merchantQuery = useQuery({
    queryKey: ["merchant", storeId],
    queryFn: () => merchantService.getMerchantById(storeId!),
    enabled: !!storeId,
    staleTime: 2 * 60 * 1000,
  });

  const thumbUri = useMemo(() => {
    const m = merchantQuery.data;
    if (!m) return null;
    const raw =
      m.displayImage ??
      m.banner_url ??
      (m as { imageUrl?: string | null }).imageUrl ??
      null;
    if (!raw) return null;
    return toAbsoluteImageUrl(raw) ?? raw;
  }, [merchantQuery.data]);

  return (
    <View style={styles.shell}>
      <PartnerChatUnreadBadge count={chatUnreadCount} style={styles.floatingUnreadBadge} />
      <Pressable
        style={styles.leftPress}
        onPress={onPress}
        hitSlop={4}
        android_ripple={{ color: "rgba(5, 150, 105, 0.08)" }}
        accessibilityRole="button"
        accessibilityLabel={`Track order from ${storeLabel}`}
      >
        <View style={styles.thumb}>
          {thumbUri && !thumbFailed ? (
            <Image
              source={{ uri: thumbUri }}
              style={styles.thumbImg}
              contentFit="cover"
              onError={() => setThumbFailed(true)}
            />
          ) : (
            <View style={styles.thumbPlaceholder}>
              <Ionicons name="bicycle" size={20} color={GatiMitraColors.textSecondary} />
            </View>
          )}
        </View>
        <View style={styles.leftTextCol}>
          <StoreText style={styles.storeName} bold numberOfLines={1}>
            {storeLabel}
          </StoreText>
          <View style={styles.statusRow}>
            <StoreText style={styles.statusText} bold numberOfLines={1}>
              {statusLine}
            </StoreText>
            <Ionicons name="chevron-forward" size={10} color={FLOAT_CART_GREEN} />
          </View>
        </View>
      </Pressable>

      <TouchableOpacity
        activeOpacity={0.92}
        onPress={onPress}
        style={styles.cta}
        accessibilityLabel={showEta ? `Arriving in ${etaLabel}` : "Track order"}
      >
        <View style={styles.ctaFill} pointerEvents="none">
          <StoreText style={styles.ctaTitle} bold>
            {showEta ? "arriving in" : "Track order"}
          </StoreText>
          <StoreText style={styles.ctaSub} bold>
            {showEta ? etaLabel : "Live"}
          </StoreText>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: FLOAT_BAR_BG,
    borderRadius: 16,
    minHeight: DOCK_PILL_MIN_HEIGHT,
    paddingLeft: 10,
    paddingRight: 10,
    paddingVertical: 8,
    gap: 4,
    borderWidth: 1,
    borderColor: FLOAT_BAR_BORDER,
    position: "relative",
  },
  floatingUnreadBadge: {
    position: "absolute",
    top: 4,
    right: 8,
    zIndex: 2,
  },
  leftPress: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
    paddingVertical: 2,
    paddingRight: 4,
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: GatiMitraColors.mintSoft,
  },
  thumbImg: {
    width: "100%",
    height: "100%",
  },
  thumbPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: GatiMitraColors.mintSoft,
  },
  leftTextCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  storeName: {
    fontSize: 14,
    fontFamily: StoreFonts.loraBold,
    color: GatiMitraColors.textPrimary,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
    marginTop: 2,
  },
  statusText: {
    flexShrink: 1,
    fontSize: 12,
    fontFamily: StoreFonts.loraBold,
    color: FLOAT_CART_GREEN,
  },
  cta: {
    borderRadius: FLOAT_CART_RADIUS,
    overflow: "hidden",
    minWidth: 96,
    flexShrink: 0,
  },
  ctaFill: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 42,
    backgroundColor: FLOAT_CART_GREEN,
    borderRadius: FLOAT_CART_RADIUS,
  },
  ctaTitle: {
    fontSize: 13,
    fontFamily: StoreFonts.loraBold,
    color: "#FFFFFF",
  },
  ctaSub: {
    fontSize: 10,
    fontFamily: StoreFonts.loraBold,
    color: "rgba(255,255,255,0.95)",
    marginTop: 1,
  },
});
