import { View, TouchableOpacity, StyleSheet, Pressable } from "react-native";
import { AppText } from "@/components/AppText";

import { Ionicons } from "@expo/vector-icons";
import type { EnrichedPlaceResult } from "@/services/location.service";
import { resolvePlaceDisplayName } from "@/services/location.service";

function highlightSegments(text: string, query: string): { text: string; match: boolean }[] {
  if (!query.trim() || !text) return [{ text, match: false }];
  const q = query.trim().toLowerCase();
  const lower = text.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx < 0) return [{ text, match: false }];
  return [
    { text: text.slice(0, idx), match: false },
    { text: text.slice(idx, idx + q.length), match: true },
    { text: text.slice(idx + q.length), match: false },
  ].filter((s) => s.text.length > 0);
}

type Props = {
  item: EnrichedPlaceResult;
  query?: string;
  distanceLabel?: string | null;
  onPress: () => void;
  favorited?: boolean;
  onToggleFavorite?: () => void;
};

/** Rapido-style row: pin + distance | title + address | heart */
export function LocationSearchResultRow({
  item,
  query = "",
  distanceLabel,
  onPress,
  favorited = false,
  onToggleFavorite,
}: Props) {
  const primary = resolvePlaceDisplayName(item);
  const secondary =
    item.secondary && item.secondary !== "—"
      ? item.secondary
      : item.fullAddress.replace(primary, "").replace(/^,\s*/, "") || item.fullAddress;
  const segments = highlightSegments(primary, query);

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.leftCol}>
        <Ionicons name="location-outline" size={20} color="#6B7280" />
        {distanceLabel ? <AppText style={styles.distance}>{distanceLabel}</AppText> : null}
      </View>

      <View style={styles.content}>
        <AppText style={styles.primary} numberOfLines={1}>
          {segments.map((seg, i) => (
            <AppText key={i} style={seg.match ? styles.match : styles.primarySegment}>
              {seg.text}
            </AppText>
          ))}
        </AppText>
        <AppText style={styles.secondary} numberOfLines={2}>
          {secondary}
        </AppText>
      </View>

      <Pressable
        style={styles.heartBtn}
        hitSlop={10}
        onPress={(e) => {
          e?.stopPropagation?.();
          onToggleFavorite?.();
        }}
        accessibilityRole="button"
        accessibilityLabel={favorited ? "Remove from favorites" : "Save location"}
      >
        <Ionicons
          name={favorited ? "heart" : "heart-outline"}
          size={20}
          color={favorited ? "#EF4444" : "#94A3B8"}
        />
      </Pressable>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 14,
    paddingLeft: 16,
    paddingRight: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
    gap: 10,
  },
  leftCol: {
    width: 44,
    alignItems: "center",
    paddingTop: 2,
  },
  distance: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "700",
    color: "#9CA3AF",
    textAlign: "center",
  },
  content: {
    flex: 1,
    minWidth: 0,
    paddingTop: 1,
    paddingRight: 4,
  },
  primary: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  primarySegment: {
    fontWeight: "700",
    color: "#111827",
  },
  match: {
    fontWeight: "800",
    color: "#111827",
  },
  secondary: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
    marginTop: 3,
    lineHeight: 18,
  },
  heartBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -4,
  },
});
