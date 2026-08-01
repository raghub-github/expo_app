import React, { useMemo } from "react";
import { AppText } from "@/components/AppText";

import { View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useScheduleTick } from "@/hooks/useScheduleTick";
import { buildStoreOpenStatusLabel } from "@/lib/storeOpenStatusLabel";
import { formatNextOpenTime, toTimestamp } from "@/lib/storeScheduleUi";
import { useRenderCount } from "@/hooks/useRenderCount";

export type MerchantClosedBannerProps = {
  merchantLoaded: boolean;
  isStoreClosedForStatus: boolean;
  nextOpenAt?: string | number | null;
  nextCloseAt?: string | number | null;
};

/**
 * Owns its own 1s countdown tick internally so the "opens/closes in Xm" copy stays live
 * without re-rendering the merchant screen (and its full, non-virtualized item list) every
 * second — this used to be computed in the parent screen and threaded through the list's
 * memoized data, which invalidated that memo (and every row) on every tick.
 */
export function MerchantClosedBanner({
  merchantLoaded,
  isStoreClosedForStatus,
  nextOpenAt,
  nextCloseAt,
}: MerchantClosedBannerProps) {
  useRenderCount("MerchantClosedBanner");
  const scheduleTickEnabled = toTimestamp(nextOpenAt) != null || toTimestamp(nextCloseAt) != null;
  const scheduleNow = useScheduleTick(scheduleTickEnabled);

  const message = useMemo(() => {
    if (!merchantLoaded || !isStoreClosedForStatus) return null;
    const openStatusLabel = buildStoreOpenStatusLabel({
      isOpen: false,
      nextOpenAt,
      nextCloseAt,
      nowMs: scheduleNow,
    });
    if (openStatusLabel.isOpeningSoon && openStatusLabel.sub) {
      return `Opening soon — browse the menu. Opens in ${openStatusLabel.sub}.`;
    }
    if (nextOpenAt) {
      const ts = toTimestamp(nextOpenAt);
      if (ts != null) {
        return `Closed for now — browse the menu. ${formatNextOpenTime(ts)}.`;
      }
    }
    return "Closed for now — you can still browse the menu. Ordering resumes when we open.";
  }, [merchantLoaded, isStoreClosedForStatus, nextOpenAt, nextCloseAt, scheduleNow]);

  if (!message) return null;

  return (
    <View style={styles.closedBanner}>
      <View style={styles.closedBannerIconWrap}>
        <Ionicons name="time-outline" size={18} color="#fff" />
      </View>
      <AppText style={styles.closedBannerText}>{message}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  closedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#374151",
  },
  closedBannerIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  closedBannerText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    color: "#fff",
  },
});
