import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
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
};

/** Rapido-style row: pin + distance | title + address | heart */
export function LocationSearchResultRow({ item, query = "", distanceLabel, onPress }: Props) {
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
        {distanceLabel ? <Text style={styles.distance}>{distanceLabel}</Text> : null}
      </View>

      <View style={styles.content}>
        <Text style={styles.primary} numberOfLines={1}>
          {segments.map((seg, i) => (
            <Text key={i} style={seg.match ? styles.match : undefined}>
              {seg.text}
            </Text>
          ))}
        </Text>
        <Text style={styles.secondary} numberOfLines={2}>
          {secondary}
        </Text>
      </View>

      <TouchableOpacity style={styles.heartBtn} hitSlop={12} onPress={onPress}>
        <Ionicons name="heart-outline" size={20} color="#9CA3AF" />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
    gap: 10,
  },
  leftCol: {
    width: 48,
    alignItems: "center",
    paddingTop: 2,
  },
  distance: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "600",
    color: "#9CA3AF",
    textAlign: "center",
  },
  content: {
    flex: 1,
    paddingTop: 1,
  },
  primary: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  match: {
    color: "#111827",
  },
  secondary: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 3,
    lineHeight: 18,
  },
  heartBtn: {
    paddingTop: 2,
    paddingLeft: 4,
  },
});
