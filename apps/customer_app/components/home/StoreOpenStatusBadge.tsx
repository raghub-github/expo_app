import { View, StyleSheet } from "react-native";
import { AppText } from "@/components/AppText";
import { buildStoreOpenStatusLabel, formatOpenStatusTagText } from "@/lib/storeOpenStatusLabel";
import { toTimestamp } from "@/lib/storeScheduleUi";
import { useScheduleTick } from "@/hooks/useScheduleTick";

type Props = {
  isOpen: boolean;
  nextOpenAt?: string | number | null;
  nextCloseAt?: string | number | null;
  compact?: boolean;
};

/**
 * Same open/closed badge as classic + grid-first list cards.
 * Do not invent a second status engine for discovery.
 */
export function StoreOpenStatusBadge({
  isOpen,
  nextOpenAt,
  nextCloseAt,
  compact = false,
}: Props) {
  const needsTick = toTimestamp(nextOpenAt) != null || toTimestamp(nextCloseAt) != null;
  const now = useScheduleTick(needsTick);

  const openStatus = buildStoreOpenStatusLabel({
    isOpen,
    nextOpenAt,
    nextCloseAt,
    nowMs: now,
  });

  const isOpeningSoon = !isOpen && openStatus.isOpeningSoon === true;
  const isClosingSoon = isOpen && openStatus.isClosingSoon === true;

  return (
    <View
      pointerEvents="none"
      style={[
        styles.openClosedTag,
        compact && styles.openClosedTagCompact,
        isClosingSoon
          ? styles.openClosedTagRed
          : isOpeningSoon
            ? styles.openClosedTagOpenSoon
            : openStatus.isGreen
              ? styles.openClosedTagGreen
              : styles.openClosedTagRed,
      ]}
    >
      <AppText
        style={[
          styles.openClosedTagText,
          compact && styles.openClosedTagTextCompact,
          (isClosingSoon || !openStatus.isGreen) && styles.openClosedTagTextRed,
        ]}
        numberOfLines={1}
      >
        {formatOpenStatusTagText(openStatus)}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  openClosedTag: {
    position: "absolute",
    top: 12,
    left: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    maxWidth: "70%",
    zIndex: 4,
  },
  openClosedTagCompact: {
    top: 6,
    left: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 7,
    maxWidth: "92%",
  },
  openClosedTagGreen: {
    backgroundColor: "#16A34A",
  },
  openClosedTagOpenSoon: {
    backgroundColor: "rgba(22, 163, 74, 0.58)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.35)",
  },
  openClosedTagRed: {
    backgroundColor: "#FF4D4F",
    borderRadius: 12,
  },
  openClosedTagText: {
    fontSize: 11,
    color: "#fff",
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  openClosedTagTextCompact: {
    fontSize: 9,
  },
  openClosedTagTextRed: {
    fontWeight: "600",
  },
});
