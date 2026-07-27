import React, { useMemo } from "react";
import { AppText } from "@/components/AppText";
import { View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useScheduleTick } from "@/hooks/useScheduleTick";
import { toTimestamp } from "@/lib/storeScheduleUi";
import { useRenderCount } from "@/hooks/useRenderCount";

export type MerchantRushBannerProps = {
  visible: boolean;
  rushEndsAt?: string | number | null;
  rushRemainingMinutes?: number | null;
};

/**
 * Closed-store-style alert when the kitchen has rush mode on.
 * Owns its own tick so remaining-time copy stays live without re-rendering the full menu list.
 */
export function MerchantRushBanner({
  visible,
  rushEndsAt,
  rushRemainingMinutes,
}: MerchantRushBannerProps) {
  useRenderCount("MerchantRushBanner");
  const endsAtMs = toTimestamp(rushEndsAt);
  const tickEnabled = visible && endsAtMs != null;
  const nowMs = useScheduleTick(tickEnabled);

  const message = useMemo(() => {
    if (!visible) return null;
    let remaining =
      endsAtMs != null
        ? Math.max(0, Math.ceil((endsAtMs - nowMs) / 60000))
        : rushRemainingMinutes != null && Number.isFinite(rushRemainingMinutes)
          ? Math.max(0, Math.floor(rushRemainingMinutes))
          : null;
    if (remaining != null && remaining <= 0) remaining = null;

    if (remaining != null && remaining > 0) {
      const minsLabel =
        remaining >= 60
          ? `~${Math.round(remaining / 60)} hr${remaining >= 90 ? "s" : ""}`
          : `~${remaining} min`;
      return `Kitchen is in rush hour — orders may take a little longer (${minsLabel} left).`;
    }
    return "Kitchen is in rush hour — orders may take a little longer than usual.";
  }, [visible, endsAtMs, nowMs, rushRemainingMinutes]);

  if (!message) return null;

  return (
    <View style={styles.banner} accessibilityRole="text">
      <View style={styles.iconWrap}>
        <Ionicons name="flash" size={18} color="#fff" />
      </View>
      <AppText style={styles.text}>{message}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#B45309",
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    color: "#fff",
  },
});
