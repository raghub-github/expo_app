import { View, TouchableOpacity, Pressable, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText } from "@/components/AppText";
import { DiscoveryColors, DISCOVERY_FLOAT_BAR_H } from "./discoveryTheme";

type SortOption = "default" | "rating" | "distance";

type Props = {
  sortBy: SortOption;
  hasActiveFilters: boolean;
  onSortPress: () => void;
  onFiltersPress: () => void;
  /**
   * dock — main footing bar (cart/track style).
   * edge — right peek when nav is expanded (CART/TRACK edge style).
   * absolute — centered overlay (legacy).
   */
  layout?: "dock" | "edge" | "absolute";
  bottomInset?: number;
  height?: number;
  /** Edge peek: tap expands filters footing (like CART edge → expandDock). */
  onEdgePress?: () => void;
};

const EDGE_OVERHANG = 12;
const EDGE_VISIBLE_MIN = 156;

function sortLabel(sortBy: SortOption): string {
  if (sortBy === "rating") return "Rating";
  if (sortBy === "distance") return "Distance";
  return "Relevance";
}

/** Floating sort/filters — dock mirrors cart; edge mirrors CART/TRACK peek. */
export function DiscoveryFloatingBar({
  sortBy,
  hasActiveFilters,
  onSortPress,
  onFiltersPress,
  layout = "absolute",
  bottomInset = 10,
  height = DISCOVERY_FLOAT_BAR_H,
  onEdgePress,
}: Props) {
  const isEdge = layout === "edge";
  const isDock = layout === "dock";
  const iconIdle = isEdge ? "#FFFFFF" : DiscoveryColors.text;
  const iconActive = isEdge ? "#5EEAD4" : DiscoveryColors.accent;
  const textIdle = isEdge ? "#FFFFFF" : DiscoveryColors.text;
  const pillH = Math.max(48, height);

  const bar = (
    <View
      style={[
        styles.bar,
        isDock && styles.barDock,
        isEdge && styles.barEdge,
        isEdge
          ? {
              height: pillH,
              backgroundColor: "#1E3A5F",
              borderColor: "transparent",
            }
          : {
              height: pillH,
              backgroundColor: DiscoveryColors.cardElevated,
              borderColor: DiscoveryColors.border,
            },
      ]}
    >
      {isEdge ? (
        <>
          <AppText style={[styles.segText, { color: textIdle }]} numberOfLines={1}>
            {sortLabel(sortBy)}
          </AppText>
          <Ionicons name="swap-vertical" size={14} color={iconIdle} />
          <View style={[styles.divider, { backgroundColor: "rgba(255,255,255,0.28)" }]} />
          <AppText
            style={[
              styles.segText,
              { color: hasActiveFilters ? iconActive : textIdle },
            ]}
            numberOfLines={1}
          >
            Filters
          </AppText>
          <Ionicons
            name="options-outline"
            size={14}
            color={hasActiveFilters ? iconActive : iconIdle}
          />
        </>
      ) : (
        <>
          <TouchableOpacity style={styles.seg} onPress={onSortPress} activeOpacity={0.85}>
            <AppText style={[styles.segText, { color: textIdle }]} numberOfLines={1}>
              {sortLabel(sortBy)}
            </AppText>
            <Ionicons name="swap-vertical" size={16} color={iconIdle} />
          </TouchableOpacity>
          <View style={[styles.divider, { backgroundColor: "rgba(255,255,255,0.18)" }]} />
          <TouchableOpacity style={styles.seg} onPress={onFiltersPress} activeOpacity={0.85}>
            <AppText
              style={[
                styles.segText,
                { color: hasActiveFilters ? iconActive : textIdle },
              ]}
              numberOfLines={1}
            >
              Filters
            </AppText>
            <Ionicons
              name="options-outline"
              size={16}
              color={hasActiveFilters ? iconActive : iconIdle}
            />
          </TouchableOpacity>
        </>
      )}
    </View>
  );

  if (isEdge) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Expand filters"
        onPress={onEdgePress}
        unstable_pressDelay={0}
        style={[styles.edgeHit, { height: pillH }]}
        collapsable={false}
      >
        {bar}
      </Pressable>
    );
  }

  if (isDock) {
    return <View style={styles.dockWrap}>{bar}</View>;
  }

  return (
    <View
      pointerEvents="box-none"
      style={[styles.absoluteDock, { bottom: Math.max(bottomInset, 10) }]}
    >
      {bar}
    </View>
  );
}

const styles = StyleSheet.create({
  absoluteDock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
  },
  dockWrap: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  edgeHit: {
    width: EDGE_VISIBLE_MIN + EDGE_OVERHANG,
    marginRight: -EDGE_OVERHANG,
    zIndex: 2,
    justifyContent: "center",
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    height: DISCOVERY_FLOAT_BAR_H,
    minWidth: 220,
    paddingHorizontal: 8,
    borderRadius: 28,
    overflow: "hidden",
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
      },
      android: { elevation: 12 },
    }),
  },
  /** Cart/track-sized main footing pill. */
  barDock: {
    width: "100%",
    minWidth: 0,
    borderRadius: 20,
    paddingHorizontal: 12,
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 14,
      },
      android: { elevation: 14 },
      default: {},
    }),
  },
  barEdge: {
    width: "100%",
    minWidth: 0,
    maxWidth: undefined,
    borderRadius: 0,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    borderWidth: 0,
    paddingHorizontal: 10,
    paddingRight: EDGE_OVERHANG + 6,
    gap: 5,
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 10,
      },
      android: { elevation: 12 },
      default: {},
    }),
  },
  seg: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 10,
    height: "100%",
  },
  segText: {
    fontSize: 13,
    fontWeight: "700",
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 22,
  },
});
