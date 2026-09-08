import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText } from "@/components/AppText";

type Props = {
  compact?: boolean;
};

export function PureVegStoreTag({ compact = false }: Props) {
  return (
    <View style={[styles.row, compact && styles.rowCompact]}>
      <View style={styles.leafWrap}>
        <Ionicons name="leaf" size={compact ? 10 : 12} color="#15803D" />
      </View>
      <AppText style={[styles.text, compact && styles.textCompact]} numberOfLines={1}>
        {compact ? "Pure Veg" : "Pure Veg restaurant"}
      </AppText>
    </View>
  );
}

export function PureVegCardFooter() {
  return (
    <View style={styles.footer}>
      <View style={styles.dashRow}>
        {Array.from({ length: 22 }, (_, i) => (
          <View key={i} style={styles.dashDot} />
        ))}
      </View>
      <PureVegStoreTag />
    </View>
  );
}

/** Extra body height for FlashList estimates (divider + tag). */
export const PURE_VEG_CARD_FOOTER_H = 28;

const styles = StyleSheet.create({
  footer: {
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  dashRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginBottom: 8,
    overflow: "hidden",
  },
  dashDot: {
    width: 3,
    height: 1,
    backgroundColor: "#D1D5DB",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  rowCompact: {
    marginTop: 4,
  },
  leafWrap: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    fontSize: 12,
    fontWeight: "700",
    color: "#15803D",
  },
  textCompact: {
    fontSize: 11,
    fontWeight: "700",
  },
});
